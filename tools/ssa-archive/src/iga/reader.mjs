// Lenient IGA v4 parser: never throws on malformed input, collects failures instead so that
// verify can report every problem with offset, actual and expected values (FR-006).
import { createHash } from 'node:crypto';
import {
  HEADER_SIZE,
  ENTRY_SIZE,
  ALIGN,
  decodeHeader,
  decodeHashes,
  entryTableOffset,
  entryTableEnd,
  compressionOf,
  failure,
  hex,
  lookupScale,
  maxProbeDistance,
} from './header.mjs';
import { readChunkArea } from './chunks.mjs';

const sha256 = b => createHash('sha256').update(b).digest('hex');

export function parseArchive(buf) {
  const issues = [];
  const header = decodeHeader(buf, issues);
  const result = {
    header,
    hashes: [],
    entries: [],
    chunk_area: null,
    name_table: null,
    regions: [],
    issues,
    size: buf.length,
  };
  if (!header) return result;
  const count = header.count;
  if (count === 0 || entryTableEnd(count) > buf.length) {
    issues.push(failure(0x0c, 'count', count, `1 .. ${Math.floor((buf.length - HEADER_SIZE) / 16)}`, 'COUNT_MISMATCH'));
    return result;
  }
  result.hashes = decodeHashes(buf, count, issues);
  // Interpolation lookup words must match the hash table.
  const scale = lookupScale(count);
  if (header.flags_packed !== scale)
    issues.push(
      failure(
        0x10,
        'lookup_scale',
        hex(header.flags_packed),
        hex(scale) + ' (0xFFFFFFFF / count)',
        'LOOKUP_WORDS_MISMATCH',
      ),
    );
  else if (!issues.some(i => i.reason === 'HASHES_NOT_SORTED')) {
    const probe = maxProbeDistance(result.hashes, scale);
    if (header.word_14 !== probe)
      issues.push(failure(0x14, 'max_probe_distance', header.word_14, probe, 'LOOKUP_WORDS_MISMATCH'));
  }

  // Name table bounds: location + size must equal the archive size (CONFIRMED on all samples).
  const nt = { offset: header.name_table_offset, size: header.name_table_size, offsets: [] };
  result.name_table = nt;
  const tablesEnd = entryTableEnd(count);
  const ntValid = nt.offset >= tablesEnd && nt.offset + nt.size === buf.length;
  if (!ntValid) {
    issues.push(
      failure(
        0x18,
        'name_table',
        `${nt.offset}+${nt.size}`,
        `offset >= ${tablesEnd} and offset+size == ${buf.length}`,
        'NAME_TABLE_BOUNDS',
      ),
    );
  }

  // Entry table.
  const entries = [];
  const tableStart = entryTableOffset(count);
  for (let i = 0; i < count; i++) {
    const o = tableStart + ENTRY_SIZE * i;
    const start = buf.readUInt32LE(o),
      size = buf.readUInt32LE(o + 4),
      mode = buf.readUInt32LE(o + 8);
    const compression = compressionOf(mode);
    const e = {
      index: i,
      name: null,
      name_offset: null,
      hash: result.hashes[i] ?? null,
      start,
      size,
      mode,
      compression,
      chunk_table_index: compression === 'LZMA_CHUNKED' ? mode & 0xffffff : null,
      stored_size: 0,
      data_sha256: null,
    };
    if (compression === null)
      issues.push(
        failure(
          o + 8,
          `entries[${i}].mode`,
          hex(mode),
          'high byte 0xFF (none) or 0x10 (LZMA chunked)',
          'UNSUPPORTED_MODE',
        ),
      );
    if (start % ALIGN !== 0)
      issues.push(failure(o, `entries[${i}].start`, start, `multiple of ${ALIGN}`, 'MISALIGNED_ENTRY'));
    const dataLimit = ntValid ? nt.offset : buf.length;
    if (start >= dataLimit || (compression === 'NONE' && start + size > dataLimit)) {
      issues.push(
        failure(o, `entries[${i}].start`, `${start}+${size}`, `start + size <= ${dataLimit}`, 'ENTRY_OUT_OF_BOUNDS'),
      );
    }
    entries.push(e);
  }
  result.entries = entries;

  // Chunk tables live between the entry table and the first data offset; word 0x08 (LIKELY the
  // total table size) bounds them when consistent, otherwise the first aligned data start does.
  const firstData = entries.length ? Math.min(...entries.map(e => e.start)) : nt.offset;
  let chunkEnd = HEADER_SIZE + header.table_size;
  if (chunkEnd < tablesEnd || chunkEnd > firstData) chunkEnd = Math.min(firstData, buf.length);
  result.chunk_area = readChunkArea(buf, tablesEnd, chunkEnd);
  for (const e of entries) {
    if (e.chunk_table_index !== null) {
      const limit = result.chunk_area ? result.chunk_area.values.length : 0;
      if (e.chunk_table_index >= limit) {
        issues.push(
          failure(
            tableStart + ENTRY_SIZE * e.index + 8,
            `entries[${e.index}].chunk_table_index`,
            e.chunk_table_index,
            `< ${limit}`,
            'CHUNK_TABLE_OUT_OF_RANGE',
          ),
        );
      }
    }
  }

  // Stored sizes: from start to the next entry start (or the name table), overlap detection.
  const inBounds = entries.filter(e => e.start < (ntValid ? nt.offset : buf.length));
  const sorted = [...inBounds].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const next = i + 1 < sorted.length ? sorted[i + 1].start : ntValid ? nt.offset : buf.length;
    e.stored_size = Math.max(0, next - e.start);
    if (i + 1 < sorted.length && sorted[i + 1].start === e.start) {
      issues.push(
        failure(
          tableStart + ENTRY_SIZE * sorted[i + 1].index,
          `entries[${sorted[i + 1].index}].start`,
          e.start,
          `distinct from entries[${e.index}].start`,
          'ENTRY_OVERLAP',
        ),
      );
    } else if (e.compression === 'NONE' && e.start + e.size > next && i + 1 < sorted.length) {
      issues.push(
        failure(
          tableStart + ENTRY_SIZE * e.index + 4,
          `entries[${e.index}].size`,
          e.size,
          `<= ${next - e.start} (next entry at ${next})`,
          'ENTRY_OVERLAP',
        ),
      );
    }
    const endStored = Math.min(e.start + e.stored_size, buf.length);
    e.data_sha256 = sha256(buf.subarray(e.start, endStored));
  }

  // Names.
  if (ntValid) {
    if (nt.offset + 4 * count > buf.length) {
      issues.push(failure(nt.offset, 'name_table.offsets', 4 * count, `<= ${nt.size}`, 'NAME_OFFSET_OUT_OF_RANGE'));
    } else {
      const seen = new Map();
      for (let i = 0; i < count; i++) {
        const rel = buf.readUInt32LE(nt.offset + 4 * i);
        nt.offsets.push(rel);
        const abs = nt.offset + rel;
        const nul = abs < buf.length ? buf.indexOf(0, abs) : -1;
        if (rel >= nt.size || nul === -1 || nul >= nt.offset + nt.size) {
          issues.push(
            failure(
              nt.offset + 4 * i,
              `name_table.offsets[${i}]`,
              rel,
              `< ${nt.size} with a NUL terminator inside the table`,
              'NAME_OFFSET_OUT_OF_RANGE',
            ),
          );
          continue;
        }
        const name = buf.toString('latin1', abs, nul);
        entries[i].name = name;
        entries[i].name_offset = rel;
        if (seen.has(name))
          issues.push(
            failure(
              nt.offset + 4 * i,
              `entries[${i}].name`,
              name,
              `unique (also entries[${seen.get(name)}])`,
              'NAME_OFFSET_OUT_OF_RANGE',
            ),
          );
        seen.set(name, i);
      }
    }
  }

  result.regions = layoutRegions(result, buf.length);
  return result;
}

// Byte regions used by diff classification (FR-007): METADATA, TABLE, CONTENT, PADDING.
export function layoutRegions(parsed, total) {
  const { header, entries, chunk_area, name_table } = parsed;
  if (!header) return [{ offset: 0, length: total, class: 'CONTENT', label: 'unparsed' }];
  const count = header.count;
  const regions = [
    { offset: 0, length: HEADER_SIZE, class: 'METADATA', label: 'header' },
    { offset: HEADER_SIZE, length: 4 * count, class: 'TABLE', label: 'hashes' },
    { offset: entryTableOffset(count), length: ENTRY_SIZE * count, class: 'TABLE', label: 'entries' },
  ];
  if (chunk_area)
    regions.push({
      offset: chunk_area.offset,
      length: 2 * chunk_area.values.length,
      class: 'TABLE',
      label: 'chunk_tables',
    });
  const sorted = [...entries].filter(e => e.stored_size > 0).sort((a, b) => a.start - b.start);
  for (const e of sorted) {
    const content = e.compression === 'NONE' ? Math.min(e.size, e.stored_size) : e.stored_size;
    regions.push({ offset: e.start, length: content, class: 'CONTENT', label: `entry ${e.index}` });
    if (e.stored_size > content)
      regions.push({
        offset: e.start + content,
        length: e.stored_size - content,
        class: 'PADDING',
        label: `entry ${e.index} padding`,
      });
  }
  if (name_table && name_table.offset + name_table.size === total) {
    regions.push({ offset: name_table.offset, length: name_table.size, class: 'TABLE', label: 'name_table' });
  }
  regions.sort((a, b) => a.offset - b.offset);
  // Gaps between regions (zero fill between tables and first data) are PADDING.
  const filled = [];
  let cursor = 0;
  for (const r of regions) {
    if (r.offset > cursor) filled.push({ offset: cursor, length: r.offset - cursor, class: 'PADDING', label: 'gap' });
    filled.push(r);
    cursor = Math.max(cursor, r.offset + r.length);
  }
  if (cursor < total) filled.push({ offset: cursor, length: total - cursor, class: 'PADDING', label: 'tail' });
  return filled;
}

export function classifyOffset(regions, offset) {
  for (const r of regions) if (offset >= r.offset && offset < r.offset + r.length) return r;
  return null;
}

export function entryStoredBytes(buf, entry) {
  return buf.subarray(entry.start, entry.start + entry.stored_size);
}

export function summarize(parsed) {
  const compression = { NONE: 0, LZMA_CHUNKED: 0, UNSUPPORTED: 0 };
  for (const e of parsed.entries) compression[e.compression ?? 'UNSUPPORTED']++;
  return {
    size: parsed.size,
    version: parsed.header?.version ?? null,
    count: parsed.header?.count ?? 0,
    name_table: parsed.name_table ? { offset: parsed.name_table.offset, size: parsed.name_table.size } : null,
    header_words: parsed.header?.header_words ?? [],
    compression,
    alignment: ALIGN,
    hashes_sorted: !parsed.issues.some(i => i.reason === 'HASHES_NOT_SORTED'),
    chunk_table_values: parsed.chunk_area ? parsed.chunk_area.values.length : 0,
    issues: parsed.issues.length,
  };
}
