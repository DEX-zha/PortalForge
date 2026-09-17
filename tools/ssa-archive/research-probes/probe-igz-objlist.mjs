import fs from 'node:fs';
const b = fs.readFileSync('../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded');
const u32 = o => b.readUInt32BE(o),
  f32 = o => b.readFloatBE(o);
const S1 = 0x4b180,
  S1SIZE = 0x40c840,
  S1END = S1 + S1SIZE;
const names = [];
let o = 0x834;
while (o < 0x14e0) {
  const e = b.indexOf(0, o);
  if (e < 0 || e >= 0x14e0) break;
  names.push(b.toString('latin1', o, e));
  o = e + 1;
}
const nm = i => names[i] ?? 'type#' + i;
console.log('--- pointer list at S1+0x20 (S1-relative?) first 5 targets');
for (let i = 0; i < 5; i++) {
  const rel = u32(S1 + 0x20 + 4 * i);
  const p = S1 + rel;
  console.log(
    `rel 0x${rel.toString(16)} -> @0x${p.toString(16)}: ` +
      [0, 4, 8, 12, 16, 20, 24, 28]
        .map(q =>
          u32(p + q)
            .toString(16)
            .padStart(8, '0'),
        )
        .join(' ') +
      `  type=${nm(u32(p))}`,
  );
}
console.log('--- array at S1+0x2cc8 first 10 targets');
for (let i = 0; i < 10; i++) {
  const rel = u32(S1 + 0x2cc8 + 4 * i);
  const p = S1 + rel;
  if (p + 32 > S1END) {
    console.log(`rel 0x${rel.toString(16)} out of S1`);
    continue;
  }
  console.log(
    `rel 0x${rel.toString(16)} -> ${nm(u32(p))} w1=${u32(p + 4)} w2=0x${u32(p + 8).toString(16)} ` +
      [12, 16, 20, 24, 28, 32, 36, 40]
        .map(q =>
          u32(p + q)
            .toString(16)
            .padStart(8, '0'),
        )
        .join(' '),
  );
}
// scan S1 for object headers: [type < names.length][1][01xxxxxx]
const objs = [];
for (let p = S1; p + 12 <= S1END; p += 4) {
  const t = u32(p);
  if (t < names.length && u32(p + 4) === 1 && u32(p + 8) >>> 24 === 1) objs.push({ p, t });
}
console.log('--- header-pattern objects:', objs.length);
const hist = new Map();
for (const ob of objs) hist.set(ob.t, (hist.get(ob.t) ?? 0) + 1);
console.log(
  [...hist.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([t, c]) => `${nm(t)}(${t}):${c}`)
    .join('  '),
);
// sizes: distance to next object per type (median)
const byType = new Map();
for (let i = 0; i + 1 < objs.length; i++) {
  const d = objs[i + 1].p - objs[i].p;
  const t = objs[i].t;
  if (!byType.has(t)) byType.set(t, []);
  byType.get(t).push(d);
}
const med = a => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
console.log(
  '--- median stride by type:',
  [...byType.entries()]
    .filter(([t, a]) => a.length >= 5)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 25)
    .map(([t, a]) => `${nm(t)}=0x${med(a).toString(16)}`)
    .join(' '),
);
fs.writeFileSync(
  '../../.local/workspaces/tutorial-bld/igz-objects.json',
  JSON.stringify({ names, objects: objs.map(x => ({ offset: x.p, type: x.t, name: nm(x.t) })) }),
);
