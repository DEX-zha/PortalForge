// Synthetic IGZ v5 files for tests (no game data). Layout mirrors the observed tutorial level.bld:
// header + section table, section 0 (second header, type names incl. empty ones, size table),
// section 1 objects with {type, 1, 0x01xxxxxx} headers, section 2 strings (align 2).
import { IGZ_MAGIC, IGZ_VERSION } from '../../src/igz/header.mjs';

export function buildIgz({
  types = ['metaobject', 'tfbLightInfo', '', 'PlacementReference', 'tfbPhysicsModel'],
  sizes = null,
  objects = [],
  strings = ['Levels/Test/ART.ma', 'Scene Graph', 'RockA_01_MAT'],
  leadIn = 0x20,
  inlineTail = 0,
  headTable = null,
} = {}) {
  // headTable: indexes of objects registered in the section-1 header table (observed layout: 8 header
  // words {0,0,0,count,count,0x80000000|tableEnd,0x1C,blockEnd}, u32[] section-relative offsets, a
  // 0x1C-byte block, then the objects). When given, leadIn is derived from it.
  if (headTable) leadIn = 0x20 + 4 * headTable.length + 0x1c;
  // strings section
  const strBuf = Buffer.concat(strings.map(s => Buffer.from(s + '\0', 'latin1')));
  const strOffsets = [];
  let acc = 0;
  for (const s of strings) {
    strOffsets.push(acc);
    acc += s.length + 1;
  }
  // section 0: second header (13 words) + names + sizes
  const names = Buffer.concat(types.map(t => Buffer.from(t + '\0', 'latin1')));
  const namesPadded = Buffer.alloc(Math.ceil((0x34 + names.length) / 4) * 4 - 0x34);
  names.copy(namesPadded);
  const sizeTable = Buffer.alloc(4 * types.length);
  types.forEach((_, i) => sizeTable.writeUInt32BE((sizes ?? types.map((t, k) => 0x18 + 8 * k))[i], 4 * i));
  const s0 = Buffer.alloc(0x34 + namesPadded.length + sizeTable.length + 16);
  [IGZ_MAGIC, IGZ_VERSION, 0x20000, 0x1c, types.length, 0x1c, 0, 1, 0, 0, 0x24, 0x248, 0x18].forEach((w, i) =>
    s0.writeUInt32BE(w >>> 0, 4 * i),
  );
  namesPadded.copy(s0, 0x34);
  sizeTable.copy(s0, 0x34 + namesPadded.length);
  // section 1: lead-in (unparsed) + objects
  const objBufs = objects.map((o, i) => {
    const b = Buffer.alloc(o.size ?? 0x30);
    b.writeUInt32BE(o.type, 0);
    b.writeUInt32BE(1, 4);
    b.writeUInt32BE(0x01000000 | (o.id ?? i + 1), 8);
    for (const f of o.fields ?? []) {
      if (f.f32 !== undefined) b.writeFloatBE(f.f32, f.at);
      else if (f.str !== undefined) b.writeUInt32BE(strOffsets[f.str], f.at);
      else if (f.u32 !== undefined) b.writeUInt32BE(f.u32 >>> 0, f.at);
      else if (f.obj !== undefined) b.writeUInt32BE(0xdeadbeef, f.at);
    }
    return b;
  });
  let s1 = Buffer.concat([Buffer.alloc(leadIn), ...objBufs, Buffer.alloc(inlineTail)]);
  // patch object refs now that offsets are known (leadIn + cumulative)
  let cursor = leadIn;
  const objOffsets = objects.map((o, i) => {
    const off = cursor;
    cursor += objBufs[i].length;
    return off;
  });
  objects.forEach((o, i) => {
    for (const f of o.fields ?? []) if (f.obj !== undefined) s1.writeUInt32BE(objOffsets[f.obj], objOffsets[i] + f.at);
  });
  const headWords = [];
  if (headTable) {
    const count = 8 + headTable.length,
      tableEnd = 4 * count,
      blockEnd = tableEnd + 0x1c;
    [0, 0, 0, count, count, (0x80000000 | tableEnd) >>> 0, 0x1c, blockEnd].forEach((w, i) =>
      s1.writeUInt32BE(w >>> 0, 4 * i),
    );
    headTable.forEach((objIndex, i) => {
      s1.writeUInt32BE(objOffsets[objIndex], 0x20 + 4 * i);
      headWords.push(0x20 + 4 * i);
    });
    headWords.push(0x1c);
  }
  // assemble
  const headerSize = 0x800;
  const off0 = headerSize,
    off1 = Math.ceil((off0 + s0.length) / 0x20) * 0x20,
    off2 = Math.ceil((off1 + s1.length) / 0x20) * 0x20;
  const total = off2 + strBuf.length;
  const buf = Buffer.alloc(total);
  buf.writeUInt32BE(IGZ_MAGIC, 0);
  buf.writeUInt32BE(IGZ_VERSION, 4);
  const table = [
    [off0, s0.length, 0x800, 0],
    [off1, s1.length, 0x20, 8],
    [off2, strBuf.length, 2, 15],
  ];
  table.forEach(([o, s, a, t], i) => {
    buf.writeUInt32BE(o, 0x10 + 16 * i);
    buf.writeUInt32BE(s, 0x14 + 16 * i);
    buf.writeUInt32BE(a, 0x18 + 16 * i);
    buf.writeUInt32BE(t, 0x1c + 16 * i);
  });
  s0.copy(buf, off0);
  s1.copy(buf, off1);
  strBuf.copy(buf, off2);
  return {
    buf,
    sections: { s0: off0, s1: off1, s2: off2 },
    objectOffsets: objOffsets.map(o => off1 + o),
    strOffsets,
    headPointerWords: headWords.map(w => off1 + w),
  };
}
