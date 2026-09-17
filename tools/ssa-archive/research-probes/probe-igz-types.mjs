import fs from 'node:fs';
const b = fs.readFileSync('../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded');
const u32 = o => b.readUInt32BE(o),
  f32 = o => b.readFloatBE(o);
const S1 = 0x4b180,
  S1END = S1 + 0x40c840,
  S2 = 0x4579c0,
  S2END = S2 + 0x337fc;
const { names, objects } = JSON.parse(fs.readFileSync('../../.local/workspaces/tutorial-bld/igz-objects.json', 'utf8'));
console.log(
  'empty-name indexes:',
  names
    .map((n, i) => (n === '' ? i : -1))
    .filter(i => i >= 0)
    .join(','),
  '| names[10..14]:',
  names.slice(10, 15).join(','),
  '| names[125..129]:',
  names.slice(125, 130).join(','),
);
const isStr = p => p >= S2 && p < S2END && (p === S2 || b[p - 1] === 0) && b[p] >= 0x21 && b[p] <= 0x7e;
const str = p => {
  const e = b.indexOf(0, p);
  return b.toString('latin1', p, Math.min(e, p + 60));
};
function fields(off, size) {
  const out = [];
  for (let q = 12; q < size; q += 4) {
    const v = u32(off + q);
    const t = S2 + v;
    if (isStr(t)) {
      out.push(`+0x${q.toString(16)}:"${str(t)}"`);
      continue;
    }
    const f = f32(off + q);
    if (Number.isFinite(f) && Math.abs(f) > 0.01 && Math.abs(f) < 5000 && Math.abs(f) !== 1)
      out.push(`+0x${q.toString(16)}:${f.toFixed(2)}`);
  }
  return out.join(' ');
}
const wanted = [
  'AbstractPlacement',
  'tfbActorInfo',
  'ActorWaypoint',
  'CameraInfo',
  'PlacementReference',
  'tfbLightInfo',
  'igTransform',
  'OpSpawn',
  'ScriptSet',
];
for (const w of wanted) {
  const idx = names.map((n, i) => (n === w ? i : -1)).filter(i => i >= 0);
  const list = objects.filter(o => idx.includes(o.type));
  console.log(`\n== ${w} idx=${idx.join('/')} count=${list.length}`);
  for (const ob of list.slice(0, 4)) {
    const next = objects.find(x => x.offset > ob.offset);
    const size = Math.min(next ? next.offset - ob.offset : 0x200, 0x200);
    console.log(`  @0x${ob.offset.toString(16)} size~0x${size.toString(16)}: ${fields(ob.offset, size)}`);
  }
}
