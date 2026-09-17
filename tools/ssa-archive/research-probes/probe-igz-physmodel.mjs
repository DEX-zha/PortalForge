import fs from 'node:fs';
const b = fs.readFileSync('../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded');
const u32 = o => b.readUInt32BE(o),
  f32 = o => b.readFloatBE(o);
const S2 = 0x4579c0,
  S2END = S2 + 0x337fc;
const { objects, names } = JSON.parse(fs.readFileSync('../../.local/workspaces/tutorial-bld/igz-objects.json', 'utf8'));
const isStr = p => p > S2 && p < S2END && b[p - 1] === 0 && b[p] >= 0x21 && b[p] <= 0x7e;
const str = p => {
  const e = b.indexOf(0, p);
  return b.toString('latin1', p, Math.min(e, p + 60));
};
function dump(off, size) {
  const parts = [];
  for (let q = 0; q < size; q += 4) {
    const v = u32(off + q);
    if (v && isStr(S2 + v)) {
      parts.push(`+${q.toString(16)}:"${str(S2 + v)}"`);
      continue;
    }
    const f = f32(off + q);
    if (Number.isFinite(f) && Math.abs(f) >= 0.01 && Math.abs(f) < 20000 && Math.abs(f) !== 1)
      parts.push(`+${q.toString(16)}:${f.toFixed(2)}`);
    else if (v && v < 0x10000) parts.push(`+${q.toString(16)}:#${v}`);
  }
  return parts.join(' ');
}
const pm = objects.filter(o => o.name === 'tfbPhysicsModel');
console.log('tfbPhysicsModel objects:', pm.length);
for (const off of [0x1a76ec]) {
  const next = objects.find(o => o.offset > off);
  console.log(
    `== tfbPhysicsModel @0x${off.toString(16)} size=0x${(next.offset - off).toString(16)}\n${dump(off, next.offset - off)}`,
  );
}
// positions of all physics models at +0x94
const rows = pm
  .map(o => ({ off: o.offset, x: f32(o.offset + 0x94), y: f32(o.offset + 0x98), z: f32(o.offset + 0x9c) }))
  .filter(r => [r.x, r.y, r.z].every(Number.isFinite) && Math.abs(r.x) < 5000);
rows.sort((a, c) => Math.hypot(a.x - 91.3, a.z - 44.2) - Math.hypot(c.x - 91.3, c.z - 44.2));
console.log('physics models by distance to the spawn:');
rows
  .slice(0, 8)
  .forEach(r =>
    console.log(
      `  @0x${r.off.toString(16)} [${r.x.toFixed(2)}, ${r.y.toFixed(2)}, ${r.z.toFixed(2)}] dist=${Math.hypot(r.x - 91.3, r.z - 44.2).toFixed(1)}`,
    ),
  );
