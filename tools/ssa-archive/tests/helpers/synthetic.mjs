// Synthetic IGA v4 archives for tests. Contains no game data (FR-017).
import {
  MAGIC,
  VERSION,
  HEADER_SIZE,
  ALIGN,
  alignUp,
  encodeHeader,
  encodeHashes,
  entryTableOffset,
  entryTableEnd,
  lookupScale,
  maxProbeDistance,
} from '../../src/iga/header.mjs';

// FNV-1a stands in for the unknown real hash: only sortedness matters to the parser.
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (const c of Buffer.from(str, 'latin1')) {
    h ^= c;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// entries: [{name, data: Buffer, mode?: number}] ; options: {chunkValues?: number[], word14?: number}
export function buildArchive(entries, options = {}) {
  const items = entries
    .map(e => ({ ...e, hash: e.hash ?? fnv1a(e.name), mode: e.mode ?? 0xffffffff }))
    .sort((a, b) => a.hash - b.hash);
  const count = items.length;
  const chunkValues = options.chunkValues ?? [];
  const tablesEnd = entryTableEnd(count) + 2 * chunkValues.length;
  let cursor = alignUp(tablesEnd);
  const placed = items.map(e => {
    const start = cursor;
    cursor = alignUp(start + e.data.length);
    return { ...e, start };
  });
  const nameTableOffset = cursor;
  // Name table: offsets then strings in entry order.
  const strings = placed.map(e => Buffer.from(e.name + '\0', 'latin1'));
  let rel = 4 * count;
  const nameOffsets = strings.map(s => {
    const o = rel;
    rel += s.length;
    return o;
  });
  const nameTableSize = options.nameTablePad ? alignUp(rel, 16) : rel;
  const total = nameTableOffset + nameTableSize;
  const buf = Buffer.alloc(total);
  const hashes = placed.map(e => e.hash);
  const words = [
    MAGIC,
    VERSION,
    16 * count + 2 * chunkValues.length,
    count,
    options.flags ?? lookupScale(count),
    options.word14 ?? maxProbeDistance(hashes),
    nameTableOffset,
    nameTableSize,
    0,
    options.word24 ?? 0,
    options.word28 ?? 0,
    0,
  ];
  encodeHeader({ header_words: words }).copy(buf, 0);
  encodeHashes(placed.map(e => e.hash)).copy(buf, HEADER_SIZE);
  placed.forEach((e, i) => {
    const o = entryTableOffset(count) + 12 * i;
    buf.writeUInt32LE(e.start, o);
    buf.writeUInt32LE(e.size ?? e.data.length, o + 4);
    buf.writeUInt32LE(e.mode >>> 0, o + 8);
    e.data.copy(buf, e.start);
  });
  chunkValues.forEach((v, i) => buf.writeUInt16LE(v, entryTableEnd(count) + 2 * i));
  nameOffsets.forEach((o, i) => buf.writeUInt32LE(o, nameTableOffset + 4 * i));
  strings.forEach((s, i) => s.copy(buf, nameTableOffset + nameOffsets[i]));
  return { buf, placed, nameTableOffset, nameTableSize, count };
}

export function sampleEntries(n = 5) {
  const entries = [];
  for (let i = 0; i < n; i++) {
    const size = 100 + i * 777;
    const data = Buffer.alloc(size);
    for (let j = 0; j < size; j++) data[j] = (i * 31 + j * 7) & 0xff;
    entries.push({ name: `c:/tfb/build/wii/test/entry_${i}.igz`, data });
  }
  return entries;
}

// Corrupted variants keyed by the failure reason they must produce.
export function corrupted(reason) {
  const base = buildArchive(sampleEntries(4));
  const b = Buffer.from(base.buf);
  const count = base.count;
  const entryOff = i => entryTableOffset(count) + 12 * i;
  switch (reason) {
    case 'BAD_MAGIC':
      b.writeUInt32LE(0x41424344, 0);
      return b;
    case 'UNSUPPORTED_VERSION':
      b.writeUInt32LE(8, 4);
      return b;
    case 'COUNT_MISMATCH':
      b.writeUInt32LE(0x7fffffff, 0x0c);
      return b;
    case 'HASHES_NOT_SORTED': {
      const h0 = b.readUInt32LE(HEADER_SIZE),
        h1 = b.readUInt32LE(HEADER_SIZE + 4);
      b.writeUInt32LE(h1, HEADER_SIZE);
      b.writeUInt32LE(h0, HEADER_SIZE + 4);
      return b;
    }
    case 'MISALIGNED_ENTRY':
      b.writeUInt32LE(base.placed[1].start + 2, entryOff(1));
      return b;
    case 'ENTRY_OVERLAP':
      b.writeUInt32LE(base.placed[0].data.length + 3 * ALIGN, entryOff(0));
      return overlapFix(b, base);
    case 'ENTRY_OUT_OF_BOUNDS':
      b.writeUInt32LE(base.nameTableOffset + 0x800, entryOff(2));
      return b;
    case 'NAME_TABLE_BOUNDS':
      return b.subarray(0, b.length - 100);
    case 'NAME_OFFSET_OUT_OF_RANGE':
      b.writeUInt32LE(0xffff, base.nameTableOffset + 4);
      return b;
    case 'UNSUPPORTED_MODE':
      b.writeUInt32LE(0x55000000, entryOff(1) + 8);
      return b;
    case 'LOOKUP_WORDS_MISMATCH':
      b.writeUInt32LE(b.readUInt32LE(0x10) + 1, 0x10);
      return b;
    case 'CHUNK_TABLE_OUT_OF_RANGE': {
      const withChunks = buildArchive(
        sampleEntries(3).map((e, i) => (i === 0 ? { ...e, mode: 0x10000007 } : e)),
        { chunkValues: [0x8000, 0x8001, 0x8002] },
      );
      return withChunks.buf;
    }
    default:
      throw new Error('unknown corruption ' + reason);
  }
}
// Make entry 0's size run past the following entry so the overlap check fires.
function overlapFix(b, base) {
  const sorted = [...base.placed].sort((x, y) => x.start - y.start);
  const first = base.placed.indexOf(sorted[0]);
  const o = entryTableOffset(base.count) + 12 * first;
  b.writeUInt32LE(sorted[0].start, o);
  b.writeUInt32LE(sorted[1].start - sorted[0].start + 5, o + 4);
  return b;
}
