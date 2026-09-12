import fs from "node:fs";
const b = fs.readFileSync("../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded");
const u32 = o => b.readUInt32BE(o);
const S1 = 0x4b180, S1END = S1 + 0x40c840, S2 = 0x4579c0, S2END = S2 + 0x337fc;
const { objects } = JSON.parse(fs.readFileSync("../../.local/workspaces/tutorial-bld/igz-objects.json", "utf8"));
// hypotheses for string references: value v -> absolute v ; S1+v ; S2+v ; (v&0x00ffffff) variants
const hyp = { abs: v => v, s1rel: v => S1 + v, s2rel: v => S2 + v, low24abs: v => v & 0xffffff, low24s2: v => S2 + (v & 0xffffff) };
const hits = Object.fromEntries(Object.keys(hyp).map(k => [k, 0]));
const isStrStart = p => p >= S2 && p < S2END && (p === S2 || b[p - 1] === 0) && b[p] >= 0x21 && b[p] <= 0x7e;
for (let p = S1; p + 4 <= S1END; p += 4) { const v = u32(p); for (const [k, f] of Object.entries(hyp)) { const t = f(v); if (isStrStart(t)) hits[k]++; } }
console.log("string-start hits per hypothesis:", JSON.stringify(hits));
// with the best hypothesis, print strings referenced from the first PlacementReference objects (within 0x1a0)
const best = Object.entries(hits).sort((a, b) => b[1] - a[1])[0][0]; const f = hyp[best];
const str = p => { const e = b.indexOf(0, p); return b.toString("latin1", p, Math.min(e, p + 60)); };
const plc = objects.filter(x => x.type === 12);
for (const ob of plc.slice(0, 8)) { const refs = []; for (let q = 0; q < 0x1a0; q += 4) { const t = f(u32(ob.offset + q)); if (isStrStart(t)) refs.push(`+0x${q.toString(16)}:"${str(t)}"`); } console.log(`PlacementReference @0x${ob.offset.toString(16)}: ${refs.join(" ")}`); }
// section 2 string sample: level object names?
const s2names = []; let p = S2; while (p < S2END && s2names.length < 40) { const e = b.indexOf(0, p); if (e < 0) break; const s = b.toString("latin1", p, e); if (s.length > 3) s2names.push(s); p = e + 1; }
console.log("section2 first strings:", s2names.join(" | "));
