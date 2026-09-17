// usage: node probe-igz-near.mjs x y z [tolerance]
import fs from 'node:fs';
const b = fs.readFileSync('../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded');
const f32 = o => b.readFloatBE(o),
  u32 = o => b.readUInt32BE(o);
const [x, y, z] = process.argv.slice(2, 5).map(Number);
const tol = Number(process.argv[5] ?? 3);
const { objects } = JSON.parse(fs.readFileSync('../../.local/workspaces/tutorial-bld/igz-objects.json', 'utf8'));
const owner = off => {
  let prev = null;
  for (const o of objects) {
    if (o.offset <= off) prev = o;
    else break;
  }
  return prev
    ? `${prev.name || 'type#' + prev.type}@0x${prev.offset.toString(16)}+0x${(off - prev.offset).toString(16)}`
    : '?';
};
const sections = [];
for (let o = 0x10; o + 16 <= 0x800; o += 16) {
  const off = u32(o);
  if (!off) break;
  sections.push({ i: sections.length, off, end: off + u32(o + 4) });
}
const sec = off => sections.find(s => off >= s.off && off < s.end)?.i ?? '-';
const hits = [];
for (let o = 0; o + 12 <= b.length; o += 4) {
  const a = f32(o);
  if (!(Math.abs(a - x) <= tol)) continue;
  const c = f32(o + 4),
    d = f32(o + 8);
  if (Math.abs(c - y) <= tol && Math.abs(d - z) <= tol) hits.push(o);
}
// also permutations (x,z,y) etc. loosely: check (x, ?, z) with any y within 50
const hitsXZ = [];
for (let o = 0; o + 12 <= b.length; o += 4) {
  const a = f32(o),
    d = f32(o + 8);
  if (Math.abs(a - x) <= tol && Math.abs(d - z) <= tol && Number.isFinite(f32(o + 4)) && Math.abs(f32(o + 4) - y) <= 60)
    hitsXZ.push(o);
}
console.log(`target (${x}, ${y}, ${z}) tol ${tol}: exact-ish triples=${hits.length}, x/z matches=${hitsXZ.length}`);
for (const o of [...new Set([...hits, ...hitsXZ])].slice(0, 30))
  console.log(
    `  0x${o.toString(16)} sec#${sec(o)} [${f32(o).toFixed(2)}, ${f32(o + 4).toFixed(2)}, ${f32(o + 8).toFixed(2)}] next=${f32(o + 12).toFixed(2)} owner=${owner(o)}`,
  );
