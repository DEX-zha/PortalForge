import fs from "node:fs";
const b = fs.readFileSync("../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded");
const u32 = o => b.readUInt32BE(o), f32 = o => b.readFloatBE(o);
const { names, objects } = JSON.parse(fs.readFileSync("../../.local/workspaces/tutorial-bld/igz-objects.json", "utf8"));
const S1 = 0x4b180, S2 = 0x4579c0, S2END = 0x4579c0 + 0x337fc;
const plc = objects.filter(x => x.name === "PlacementReference" && x.type === 12);
console.log("PlacementReference(12):", plc.length);
const str = p => { const e = b.indexOf(0, p); return e > p && e - p < 80 ? b.toString("latin1", p, e) : null; };
function describe(ob, size = 0x1a0) {
  const out = []; const p = ob.offset;
  for (let q = 0; q < size; q += 4) {
    const w = u32(p + q), f = f32(p + q);
    let note = null;
    const cands = [w, S1 + w, w & 0x7fffffff, S1 + (w & 0x7fffffff)];
    for (const c of cands) if (c >= S2 && c < S2END) { const s = str(c); if (s && /^[\x20-\x7e]+$/.test(s)) { note = `"${s}"`; break; } }
    if (!note && Number.isFinite(f) && Math.abs(f) > 1e-3 && Math.abs(f) < 1e5 && Math.abs(f) !== 1) note = f.toFixed(3);
    if (note) out.push(`+0x${q.toString(16)}=${note}`);
  }
  return out.join(" ");
}
for (const ob of plc.slice(0, 6)) console.log(`@0x${ob.offset.toString(16)}: ${describe(ob)}`);
// find 4x4 matrix with homogeneous last row inside the first placement objects
let withMatrix = 0, sample = [];
for (const ob of plc) { for (let q = 0; q + 64 <= 0x1a0; q += 4) { const m = []; for (let i = 0; i < 16; i++) m.push(f32(ob.offset + q + 4 * i)); if (m.every(v => Number.isFinite(v) && Math.abs(v) < 1e5) && m[3] === 0 && m[7] === 0 && m[11] === 0 && m[15] === 1 && (m[12] !== 0 || m[14] !== 0)) { withMatrix++; if (sample.length < 8) sample.push(`@0x${ob.offset.toString(16)}+0x${q.toString(16)} T=[${m[12].toFixed(1)}, ${m[13].toFixed(1)}, ${m[14].toFixed(1)}] diag=[${m[0].toFixed(2)},${m[5].toFixed(2)},${m[10].toFixed(2)}]`); break; } } }
console.log("placements with an embedded row-major matrix (last row 0 0 0 1):", withMatrix); sample.forEach(s => console.log("  " + s));
// column-major variant: last column 0 0 0 1 i.e. m[3]=m[7]=m[11]=0, m[15]=1 same; translation in m[12..14] vs m[3],m[7],m[11]: try translation in indices 3,7,11 with last row 0,0,0,1
let colMajor = 0, s2 = [];
for (const ob of plc) { for (let q = 0; q + 64 <= 0x1a0; q += 4) { const m = []; for (let i = 0; i < 16; i++) m.push(f32(ob.offset + q + 4 * i)); if (m.every(v => Number.isFinite(v) && Math.abs(v) < 1e5) && m[12] === 0 && m[13] === 0 && m[14] === 0 && m[15] === 1 && (m[3] !== 0 || m[11] !== 0)) { colMajor++; if (s2.length < 5) s2.push(`@0x${ob.offset.toString(16)}+0x${q.toString(16)} T=[${m[3].toFixed(1)}, ${m[7].toFixed(1)}, ${m[11].toFixed(1)}]`); break; } } }
console.log("placements with column-major matrix:", colMajor); s2.forEach(s => console.log("  " + s));
