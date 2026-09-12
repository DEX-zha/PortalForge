import fs from "node:fs";
const b = fs.readFileSync("../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded");
const u32 = o => b.readUInt32BE(o);
// type names between 0x834 and the sizes table
const names = []; let o = 0x834; while (o < 0x14e0) { const e = b.indexOf(0, o); if (e < 0 || e >= 0x14e0) break; const s = b.toString("latin1", o, e); if (s.length) names.push(s); o = e + 1; }
console.log("type names:", names.length, "first:", names.slice(0, 6).join(","), "last:", names.slice(-3).join(","));
const sizes = []; for (let p = 0x14e0; p < 0x2000; p += 4) { sizes.push(u32(p)); }
console.log("sizes[0..8]:", sizes.slice(0, 8).map(v => "0x" + v.toString(16)).join(" "), "… value at index names.length-1:", "0x" + (sizes[names.length - 1] ?? 0).toString(16), "next:", "0x" + (sizes[names.length] ?? 0).toString(16), "0x" + (sizes[names.length + 1] ?? 0).toString(16));
function dump(start, len, label) { console.log("--- " + label + " @0x" + start.toString(16)); for (let p = start; p < start + len; p += 16) { const hex = [...b.subarray(p, p + 16)].map(x => x.toString(16).padStart(2, "0")).join(" "); const f = [0, 4, 8, 12].map(i => b.readFloatBE(p + i)).map(v => (Math.abs(v) < 1e6 && Math.abs(v) > 1e-4 || v === 0) ? v.toFixed(2) : "-"); console.log(p.toString(16).padStart(8, "0") + ": " + hex + "   f32be: " + f.join(" ")); } }
dump(0xd8418, 0x80, "object record 0 (first pointer in section 1 list)");
dump(0xd8418 + 0x40 * 100, 0x40, "object record 100");
dump(0x4b180 + 0x2cc8, 0x60, "section1 + 0x2cc8 (flagged pointer)");
// how many 0x40-spaced pointers follow at 0x4b1a0?
let n = 0, p = 0x4b1a0; while (u32(p) === 0xd8418 + 0x40 * n) { n++; p += 4; if (n > 5000) break; }
console.log("consecutive 0x40-spaced pointers from 0x4b1a0:", n, "next word:", "0x" + u32(p).toString(16), "at 0x" + p.toString(16));
