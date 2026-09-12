import fs from "node:fs";
const b = fs.readFileSync("../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded");
const u32 = o => b.readUInt32BE(o), f32 = o => b.readFloatBE(o);
const S1 = 0x4b180, S1END = S1 + 0x40c840, S2 = 0x4579c0, S2END = S2 + 0x337fc;
const { names } = JSON.parse(fs.readFileSync("../../.local/workspaces/tutorial-bld/igz-objects.json", "utf8"));
const T = names.indexOf("igTransform"), G = names.indexOf("igGroup"), N = names.indexOf("igNode"), TS = names.indexOf("igTransformSequence1_5");
console.log("type idx igTransform", T, "igGroup", G, "igNode", N, "igTransformSequence1_5", TS);
// occurrences of type word followed by a 0x01xxxxxx id somewhere in the next 2 words (refcount may vary)
function findType(t) { const out = []; for (let p = S1; p + 12 <= S1END; p += 4) { if (u32(p) === t && ((u32(p + 8) >>> 24) === 1 || (u32(p + 4) >>> 24) === 1)) out.push(p); } return out; }
const trs = findType(T); console.log("igTransform candidates:", trs.length);
const isStr = p => p > S2 && p < S2END && b[p - 1] === 0 && b[p] >= 0x21 && b[p] <= 0x7e;
const str = p => { const e = b.indexOf(0, p); return b.toString("latin1", p, Math.min(e, p + 50)); };
let withMat = 0; const samples = [];
for (const p of trs) {
  // search a 4x4 matrix in the next 0x80 bytes: rows with last column 0,0,0,1 (row-major) or last row (col-major)
  for (let q = 12; q + 64 <= 0x90; q += 4) {
    const m = []; for (let i = 0; i < 16; i++) m.push(f32(p + q + 4 * i));
    if (!m.every(v => Number.isFinite(v) && Math.abs(v) < 1e5)) continue;
    const rowMajor = m[3] === 0 && m[7] === 0 && m[11] === 0 && m[15] === 1;
    const colMajor = m[12] === 0 && m[13] === 0 && m[14] === 0 && m[15] === 1;
    if (rowMajor || colMajor) {
      withMat++;
      const trans = rowMajor ? [m[12], m[13], m[14]] : [m[3], m[7], m[11]];
      let name = null; for (let k = 12; k < q; k += 4) { const v = u32(p + k); if (v && isStr(S2 + v)) { name = str(S2 + v); break; } }
      if (samples.length < 25 && (Math.abs(trans[0]) > 1 || Math.abs(trans[2]) > 1)) samples.push(`@0x${p.toString(16)} mat@+0x${q.toString(16)} ${rowMajor ? "row" : "col"} T=[${trans.map(v => v.toFixed(2)).join(", ")}] name=${name}`);
      break;
    }
  }
}
console.log("igTransform with matrix:", withMat); samples.forEach(s => console.log("  " + s));
