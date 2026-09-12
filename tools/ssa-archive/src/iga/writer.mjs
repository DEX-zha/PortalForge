// IGA v4 writer (research.md R6).
// Strategies:
//   BYTE_PRESERVING  : every unchanged entry, table and unknown header word is emitted verbatim.
//   REENCODE_REPLACED: a replaced LZMA-chunked entry is re-encoded through a supplied re-encoder.
// Layout options (semantically equivalent, byte-different rebuilds used to make M1 meaningful):
//   layout 'preserve'   : original offsets; replaced entries stay in place when they fit.
//   layout 'sequential' : entries relaid in entry-table order on 0x800 boundaries.
//   padUnits            : extra 0x800 blocks inserted before the name table (changes the size).
//   transformAll(entry, storedBytes, manifest) -> {bytes, size} | null : rewrite every entry.
import fs from 'node:fs';
import path from 'node:path';
import { HEADER_SIZE, ALIGN, alignUp, encodeHeader, encodeHashes, entryTableOffset } from './header.mjs';
import { encodeChunkArea } from './chunks.mjs';
import { readManifest } from '../workspace/manifest.mjs';

export function rebuildFromWorkspace(dir, { replacements = {}, reencode = null, layout = 'preserve', padUnits = 0, transformAll = null } = {}) {
  const m = readManifest(dir);
  const count = m.entries.length;
  const replaced = Object.keys(replacements).map(Number).sort((a, b) => a - b);
  for (const i of replaced) if (!m.entries[i]) throw new Error(`No entry with index ${i}`);
  if (!['preserve', 'sequential'].includes(layout)) throw new Error('layout must be preserve or sequential');

  let reencoded = false, transformed = 0;
  const items = m.entries.map(e => {
    let bytes = fs.readFileSync(path.join(dir, e.file));
    let size = e.size, span = e.stored_size, changed = false;
    if (replacements[e.index] !== undefined) {
      const data = fs.readFileSync(path.resolve(replacements[e.index]));
      if (e.compression === 'LZMA_CHUNKED') {
        if (!reencode) throw new Error(`REENCODE_NOT_AVAILABLE: entry ${e.index} (${e.name}) is LZMA-chunked and no confirmed re-encoder is configured`);
        const r = reencode(e, data, m); bytes = r.bytes; size = r.size; reencoded = true;
      } else { bytes = data; size = data.length; }
      span = alignUp(Math.max(bytes.length, 1)); changed = true;
    } else if (transformAll) {
      const r = transformAll(e, bytes, m);
      if (r) { bytes = r.bytes; size = r.size; span = alignUp(Math.max(bytes.length, 1)); changed = true; transformed++; if (e.compression === 'LZMA_CHUNKED') reencoded = true; }
    }
    return { ...e, bytes, newSize: size, newSpan: span, changed };
  });

  const firstData = Math.min(...m.entries.map(e => e.start));
  const words = [...m.header_words];
  let relayout = layout === 'sequential' || items.some(it => it.changed && it.newSpan > it.stored_size);
  let nameTableOffset = m.name_table.offset;
  if (relayout) {
    let cursor = firstData;
    const order = layout === 'sequential' ? items : [...items].sort((a, b) => a.start - b.start);
    for (const it of order) {
      it.newStart = cursor;
      cursor = alignUp(cursor + (it.changed || layout === 'sequential' ? it.newSpan : it.stored_size));
    }
    nameTableOffset = cursor;
  } else {
    for (const it of items) it.newStart = it.start;
  }
  nameTableOffset += padUnits * ALIGN;
  if (nameTableOffset !== m.name_table.offset) { relayout = relayout || padUnits > 0; words[6] = nameTableOffset; }
  const total = nameTableOffset + m.name_table.size;
  const buf = Buffer.alloc(total);

  encodeHeader({ header_words: words }).copy(buf, 0);
  encodeHashes(m.hashes).copy(buf, HEADER_SIZE);
  items.forEach((it, i) => {
    const o = entryTableOffset(count) + 12 * i;
    buf.writeUInt32LE(it.newStart, o); buf.writeUInt32LE(it.newSize >>> 0, o + 4); buf.writeUInt32LE(it.mode >>> 0, o + 8);
  });
  for (const ct of m.chunk_tables ?? []) encodeChunkArea(ct).copy(buf, ct.offset);
  for (const gap of m.raw_gaps ?? []) {
    if (gap.offset >= firstData && (relayout || padUnits)) continue;   // data-area gaps lose their meaning after a relayout
    Buffer.from(gap.hex, 'hex').copy(buf, gap.offset);
  }
  for (const it of items) {
    const span = relayout ? (it.changed || layout === 'sequential' ? it.newSpan : it.stored_size) : it.stored_size;
    it.bytes.copy(buf, it.newStart, 0, Math.min(it.bytes.length, span));
  }
  const nt = nameTableOffset;
  let sequential = 4 * count;
  items.forEach((it, i) => {
    const rel = it.name_offset ?? sequential;
    buf.writeUInt32LE(rel, nt + 4 * i);
    const s = Buffer.from(it.name + '\0', 'latin1');
    s.copy(buf, nt + rel);
    sequential = Math.max(sequential, rel + s.length);
  });
  for (const pair of (m.name_table.tail_hex ?? '').split(';').filter(Boolean)) {
    const [off, val] = pair.split(':'); buf[nt + parseInt(off, 16)] = parseInt(val, 16);
  }
  const strategy = reencoded ? 'REENCODE_REPLACED' : 'BYTE_PRESERVING';
  return { buffer: buf, strategy, replaced_entries: replaced, transformed_entries: transformed, relayout, layout, pad_units: padUnits, size: total };
}
