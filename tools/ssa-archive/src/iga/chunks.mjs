// Chunk tables of LZMA-chunked entries. Read side preserves the raw u16 values verbatim with
// confidence UNKNOWN until decoding proves their semantics (research.md R2/R3, data-model ChunkTable).
// Decode/encode adapters are added by task T033 once the codec is pinned (T032).

export function readChunkArea(buf, start, end) {
  if (end <= start || start >= buf.length) return null;
  const limit = Math.min(end, buf.length);
  const values = [];
  for (let o = start; o + 2 <= limit; o += 2) values.push(buf.readUInt16LE(o));
  if (values.length === 0) return null;
  return { offset: start, values, confidence: 'UNKNOWN', decoded: null };
}

export function encodeChunkArea(area) {
  if (!area) return Buffer.alloc(0);
  const b = Buffer.alloc(2 * area.values.length);
  area.values.forEach((v, i) => b.writeUInt16LE(v & 0xFFFF, 2 * i));
  return b;
}
