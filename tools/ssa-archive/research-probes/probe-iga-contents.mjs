import fs from 'node:fs';
for (const file of [
  'character/001_Gryphon.arc',
  'character/001_Gryphon.bld',
  'level/Level_027_Tutorial.arc',
  'level/Level_027_Tutorial.bld',
  'level/Level_000_Mining.bld',
]) {
  const b = fs.readFileSync('../../.local/samples/DATA/files/' + file);
  const u32 = o => b.readUInt32LE(o);
  const count = u32(0x0c),
    ntLoc = u32(0x18);
  const local = 0x30 + 4 * count;
  const names = Array.from({ length: count }, (_, i) => {
    const off = u32(ntLoc + 4 * i);
    const end = b.indexOf(0, ntLoc + off);
    return b.toString('latin1', ntLoc + off, end);
  });
  const ext = {};
  for (const n of names) {
    const m = /(\.[a-z0-9_]+)$/i.exec(n);
    const k = m ? m[1].toLowerCase() : '(none)';
    ext[k] = (ext[k] || 0) + 1;
  }
  const nonSound = names.filter(n => !/\.wav\.enc$/i.test(n)).slice(0, 12);
  const tablesEnd = local + 12 * count;
  console.log(
    JSON.stringify({
      file,
      count,
      ext,
      nonSound,
      hdr08: u32(8),
      tablesEnd,
      chunkAreaHex: b.subarray(tablesEnd, Math.min(tablesEnd + 64, 0x800)).toString('hex'),
    }),
  );
}
