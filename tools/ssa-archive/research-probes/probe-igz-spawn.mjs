import fs from 'node:fs';
const b = fs.readFileSync('../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded');
const u32 = o => b.readUInt32BE(o),
  f32 = o => b.readFloatBE(o);
const S2 = 0x4579c0,
  S2END = S2 + 0x337fc;
const { objects } = JSON.parse(fs.readFileSync('../../.local/workspaces/tutorial-bld/igz-objects.json', 'utf8'));
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
    else if (v) parts.push(`+${q.toString(16)}:0x${v.toString(16)}`);
  }
  return parts.join(' ');
}
for (const off of [0x1391ec, 0x35191c]) {
  const ob = objects.find(o => o.offset === off);
  const next = objects.find(o => o.offset > off);
  console.log(
    `\n== ${ob?.name} @0x${off.toString(16)} size=0x${(next.offset - off).toString(16)}\n${dump(off, next.offset - off)}`,
  );
}
// all PlacementReference (type 12) with a float triple at +0xb0 (y may be 0) -> list with any name string in the object
const plc = objects.filter(o => o.type === 12);
const rows = [];
for (const ob of plc) {
  const next = objects.find(o => o.offset > ob.offset);
  const size = next ? next.offset - ob.offset : 0x200;
  if (size < 0xbc) continue;
  const x = f32(ob.offset + 0xb0),
    y = f32(ob.offset + 0xb4),
    z = f32(ob.offset + 0xb8);
  if (![x, y, z].every(v => Number.isFinite(v) && Math.abs(v) < 5000) || (x === 0 && z === 0)) continue;
  let name = null;
  for (let q = 12; q < Math.min(size, 0xb0); q += 4) {
    const v = u32(ob.offset + q);
    if (v && isStr(S2 + v)) {
      const s = str(S2 + v);
      if (!/\.(png|ma)$/.test(s) && s !== 'Scene Graph') {
        name = s;
        break;
      }
    }
  }
  rows.push({ off: ob.offset, x, y, z, size, name });
}
console.log(`\nPlacementReference with triple at +0xb0: ${rows.length}`);
rows.sort((a, b) => Math.hypot(a.x - 91.3, a.z - 44.2) - Math.hypot(b.x - 91.3, b.z - 44.2));
for (const r of rows.slice(0, 20))
  console.log(
    `  @0x${r.off.toString(16)} size=0x${r.size.toString(16)} pos=[${r.x.toFixed(2)}, ${r.y.toFixed(2)}, ${r.z.toFixed(2)}] dist=${Math.hypot(r.x - 91.3, r.z - 44.2).toFixed(1)} name=${r.name}`,
  );
