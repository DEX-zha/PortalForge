// LZMA-chunked entries: decode (CONFIRMED by full decode of every entry of three .bld samples,
// see docs/format/iga-v4.md) and re-encode for the single mutated entry of an M2 experiment.
//
// Chunk layout (entry-relative offsets, 0x800 alignment, 0x8000-byte chunks):
//   compressed chunk : [u16 BE compressed size][5-byte LZMA props 5d 00 80 00 00][stream]
//   raw chunk        : 0x8000 bytes verbatim (last chunk: remaining bytes)
// Chunk tables live between the entry table and the data area:
//   multi-chunk entries : u16 LE values[N+1] at u16 index (mode & 0xFFFFFF); value = (compressed
//                         ? 0x8000 : 0) | offset/0x800 ; last value = end offset in 0x800 units
//   single-chunk entries: 2-byte record [flags 0x80 = compressed][stored units] at byte offset
//                         (mode & 0xFFFFFF) inside the record area that follows the u16 area
//   header word 0x24 = number of u16 values, header word 0x28 = bytes of single-chunk records.
import fs from 'node:fs';
import path from 'node:path';
import { compress, decompress } from 'lzma1';
import { CHUNK_SIZE, ALIGN, alignUp } from './header.mjs';
import { readManifest, writeManifest } from '../workspace/manifest.mjs';

export const LZMA_PROPS = Buffer.from([0x5d, 0x00, 0x80, 0x00, 0x00]);
export const CHUNK_HEADER = 7;
export const chunkCount = size => Math.max(1, Math.ceil(size / CHUNK_SIZE));

export function validProps(p) {
  return p.length === 5 && p[0] === 0x5d && p.readUInt32LE(1) >= 0x1000 && p.readUInt32LE(1) <= CHUNK_SIZE;
}

export function lzmaDecode(stream, props, size) {
  if (!validProps(props)) throw new Error('Invalid LZMA properties ' + Buffer.from(props).toString('hex'));
  const header = Buffer.alloc(13); Buffer.from(props).copy(header, 0); header.writeBigUInt64LE(BigInt(size), 5);
  const out = Buffer.from(decompress(new Uint8Array(Buffer.concat([header, stream]))));
  if (out.length !== size) throw new Error(`LZMA chunk decoded to ${out.length} bytes, expected ${size}`);
  return out;
}

// Returns the raw LZMA stream for one chunk, declared with the archive's fixed properties.
// lzma1 emits a 13-byte .lzma header (props, dictionary, size) which is stripped; the encoder's
// lc/lp/pb defaults (3/0/2) match 0x5D and any match distance inside a <= 0x8000-byte chunk fits
// the 0x8000 dictionary declared in LZMA_PROPS. Every chunk is verified by decoding.
export function lzmaEncodeChunk(data, mode = 5) {
  const out = Buffer.from(compress(new Uint8Array(data), mode));
  if (out[0] !== LZMA_PROPS[0]) throw new Error('Encoder produced unexpected LZMA properties ' + out.subarray(0, 5).toString('hex'));
  const stream = out.subarray(13);
  const check = lzmaDecode(stream, LZMA_PROPS, data.length);
  if (Buffer.compare(check, data) !== 0) throw new Error('LZMA round trip mismatch');
  return stream;
}

// tables: {values: u16[], word_24, word_28}
export function entryChunkPlan(entry, tables) {
  const n = chunkCount(entry.size);
  const idx = entry.chunk_table_index ?? 0;
  if (n > 1) {
    const values = tables.values.slice(idx, idx + n + 1);
    if (values.length !== n + 1) throw new Error(`Chunk table for entry ${entry.index} needs ${n + 1} values at index ${idx}`);
    return { kind: 'multi', chunks: values.slice(0, n).map((v, i) => ({ offset: (v & 0x7fff) * ALIGN, compressed: (v & 0x8000) !== 0, index: i })), end: (values[n] & 0x7fff) * ALIGN, values };
  }
  // Single chunk: record [flags][units] at byte offset idx inside the record area.
  const recordU16 = tables.word_24 + (idx >> 1);
  const rec = tables.values[recordU16];
  const bytes = rec === undefined ? null : [rec & 0xff, rec >> 8];   // LE u16 -> [byte0, byte1]
  const compressed = bytes ? (bytes[0] & 0x80) !== 0 : true;
  const units = bytes ? (((bytes[0] & 0x7f) << 8) | bytes[1]) : null;
  return { kind: 'single', chunks: [{ offset: 0, compressed, index: 0 }], end: units === null ? null : units * ALIGN, record_u16_index: rec === undefined ? null : recordU16 };
}

export function decodeStoredEntry(stored, entry, tables) {
  const plan = entryChunkPlan(entry, tables);
  const parts = []; let remaining = entry.size;
  for (const c of plan.chunks) {
    const want = Math.min(CHUNK_SIZE, remaining);
    if (c.compressed) {
      const csize = stored.readUInt16BE(c.offset);
      const props = stored.subarray(c.offset + 2, c.offset + 7);
      parts.push(lzmaDecode(stored.subarray(c.offset + CHUNK_HEADER, c.offset + CHUNK_HEADER + csize), props, want));
    } else {
      parts.push(stored.subarray(c.offset, c.offset + want));
    }
    remaining -= want;
  }
  return Buffer.concat(parts);
}

// Builds stored bytes and chunk records for `data`, keeping the original chunk count.
export function encodeEntryChunks(data, { mode = 5, allowRaw = true } = {}) {
  const n = chunkCount(data.length);
  const pieces = []; const values = []; let offset = 0;
  for (let i = 0; i < n; i++) {
    const slice = data.subarray(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, data.length));
    let stream = null;
    try { stream = lzmaEncodeChunk(slice, mode); } catch (e) { if (!allowRaw) throw e; }
    const useRaw = allowRaw && (stream === null || stream.length + CHUNK_HEADER >= slice.length);
    values.push((useRaw ? 0 : 0x8000) | (offset / ALIGN));
    let chunk;
    if (useRaw) chunk = Buffer.from(slice);
    else { const h = Buffer.alloc(CHUNK_HEADER); h.writeUInt16BE(stream.length, 0); LZMA_PROPS.copy(h, 2); chunk = Buffer.concat([h, stream]); }
    const padded = Buffer.alloc(alignUp(Math.max(chunk.length, 1))); chunk.copy(padded, 0);
    pieces.push(padded); offset += padded.length;
  }
  values.push(offset / ALIGN);
  return { bytes: Buffer.concat(pieces), values, chunk_count: n, stored_units: offset / ALIGN };
}

function tablesFromManifest(m) {
  return { values: m.chunk_tables[0]?.values ?? [], word_24: m.header_words[9], word_28: m.header_words[10] };
}

// Decodes every compressed entry of a workspace to entries/<file>.decoded and records the proof.
export async function decodeWorkspace(dir) {
  const m = readManifest(dir);
  const tables = tablesFromManifest(m);
  const compressed = m.entries.filter(e => e.compression === 'LZMA_CHUNKED');
  if (!compressed.length) return { decoded: 0, total: 0, reason: 'no compressed entries' };
  let decoded = 0; const details = [];
  for (const e of compressed) {
    const stored = fs.readFileSync(path.join(dir, e.file));
    try {
      const out = decodeStoredEntry(stored, e, tables);
      const file = e.file + '.decoded';
      fs.writeFileSync(path.join(dir, file), out);
      e.decoded_file = file; decoded++;
      const plan = entryChunkPlan(e, tables);
      details.push({ index: e.index, kind: plan.kind, chunks: plan.chunks.length, compressed_chunks: plan.chunks.filter(c => c.compressed).length, magic: out.subarray(0, 4).toString('latin1') });
    } catch (err) {
      details.push({ index: e.index, error: err.message });
    }
  }
  if (m.chunk_tables[0]) {
    m.chunk_tables[0].confidence = decoded === compressed.length ? 'CONFIRMED' : 'LIKELY';
    m.chunk_tables[0].decoded = { multi_values: tables.word_24, single_records: tables.word_28 / 2, entries: details };
  }
  writeManifest(dir, m);
  return { decoded, total: compressed.length, reason: decoded === compressed.length ? null : 'some entries failed to decode; see manifest chunk_tables[0].decoded', details };
}

// transformAll hook for the writer: re-encode every LZMA-chunked entry from its stored bytes.
// Produces a semantically identical, byte-different archive for the M1b in-game proof.
export function reencodeStoredEntry(entry, stored, manifest) {
  if (entry.compression !== 'LZMA_CHUNKED') return null;
  const data = decodeStoredEntry(stored, entry, tablesFromManifest(manifest));
  return reencodeEntry(entry, data, manifest);
}

// Re-encoder handed to the writer for a replaced LZMA-chunked entry. The manifest tables are updated
// in place before emission. A multi-chunk entry may change its chunk count (spec 002 T022): its N+1
// u16 values are spliced, header word 0x24 (u16 count) and 0x08 (table area size) are adjusted, and
// the chunk_table_index of the other multi-chunk entries that follow it in the u16 area shifts.
// Single-chunk entries keep their 2-byte record and cannot grow past one chunk here.
export function reencodeEntry(entry, data, manifest) {
  const tables = tablesFromManifest(manifest);
  const original = chunkCount(entry.size), now = chunkCount(data.length);
  const plan = entryChunkPlan(entry, tables);
  if (now !== original && plan.kind !== 'multi') throw new Error(`REENCODE_CHUNK_COUNT_CHANGED: entry ${entry.index} is single-chunk and the replacement needs ${now} chunk(s)`);
  const enc = encodeEntryChunks(data);
  const values = manifest.chunk_tables[0].values;
  if (plan.kind === 'multi') {
    const delta = now - original;
    values.splice(entry.chunk_table_index, original + 1, ...enc.values);
    if (delta !== 0) {
      manifest.header_words[9] += delta;             // u16 count of the multi-chunk area
      manifest.header_words[2] += 2 * delta;         // table area size
      manifest.chunk_tables[0].values = values;
      for (const e of manifest.entries) {
        if (e.index === entry.index || e.compression !== 'LZMA_CHUNKED' || chunkCount(e.size) <= 1) continue;
        if (e.chunk_table_index > entry.chunk_table_index) { e.chunk_table_index += delta; e.mode = (e.mode & 0xff000000) | (e.chunk_table_index & 0xffffff); }
      }
    }
  } else if (plan.record_u16_index !== null) {
    const units = enc.stored_units, flags = enc.values[0] & 0x8000 ? 0x80 : 0x00;
    values[plan.record_u16_index] = ((units & 0xff) << 8) | flags | ((units >> 8) & 0x7f);
  }
  return { bytes: enc.bytes, size: data.length, chunk_values: enc.values, chunk_delta: now - original };
}
