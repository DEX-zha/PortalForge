import fs from 'node:fs';
const b = fs.readFileSync('../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded');
const u32 = o => b.readUInt32BE(o),
  f32 = o => b.readFloatBE(o),
  u16 = o => b.readUInt16BE(o);
const { names, objects } = JSON.parse(fs.readFileSync('../../.local/workspaces/tutorial-bld/igz-objects.json', 'utf8'));
const t52 = objects.filter(o => o.type === 52);
console.log(
  'type#52 objects:',
  t52.length,
  'first offsets:',
  t52
    .slice(0, 4)
    .map(o => '0x' + o.offset.toString(16))
    .join(' '),
);
// dump 3 records fully as words/floats
for (const ob of t52.slice(0, 3)) {
  const p = ob.offset;
  const words = [];
  for (let q = 0; q < 0x40; q += 4) {
    const v = u32(p + q),
      f = f32(p + q);
    words.push(Number.isFinite(f) && Math.abs(f) > 0.01 && Math.abs(f) < 1e5 ? f.toFixed(2) : '0x' + v.toString(16));
  }
  console.log(`@0x${p.toString(16)}: ${words.join(' ')}`);
}
// bounding box of float triples at +0x30 and +0x40? use quads found earlier: (+0x30: x y z 0 | +0x40: x y z 0 | u16 u16)
let minx = 1e9,
  maxx = -1e9,
  minz = 1e9,
  maxz = -1e9,
  miny = 1e9,
  maxy = -1e9,
  n = 0;
for (const ob of t52) {
  for (const q of [0x30, 0x40]) {
    const x = f32(ob.offset + q),
      y = f32(ob.offset + q + 4),
      z = f32(ob.offset + q + 8),
      w = f32(ob.offset + q + 12);
    if (![x, y, z].every(Number.isFinite) || w !== 0 || Math.abs(x) > 1e4 || Math.abs(x) < 1e-3) continue;
    n++;
    minx = Math.min(minx, x);
    maxx = Math.max(maxx, x);
    miny = Math.min(miny, y);
    maxy = Math.max(maxy, y);
    minz = Math.min(minz, z);
    maxz = Math.max(maxz, z);
  }
}
console.log(
  `type#52 position bbox over ${n} points: x[${minx.toFixed(1)}, ${maxx.toFixed(1)}] y[${miny.toFixed(1)}, ${maxy.toFixed(1)}] z[${minz.toFixed(1)}, ${maxz.toFixed(1)}]`,
);
// what object types precede/follow the type#52 block?
const idx = objects.findIndex(o => o.type === 52);
console.log(
  'neighbours:',
  objects
    .slice(Math.max(0, idx - 3), idx)
    .map(o => o.name + '@0x' + o.offset.toString(16))
    .join(' '),
  '| after block:',
  objects
    .filter(o => o.offset > t52[t52.length - 1].offset)
    .slice(0, 3)
    .map(o => o.name + '@0x' + o.offset.toString(16))
    .join(' '),
);
