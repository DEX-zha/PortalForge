import fs from "node:fs"; import path from "node:path";
import { parseArchive } from "../src/iga/reader.mjs";
const root = "../../.local/samples/DATA/files";
for (const rel of ["character/001_Gryphon.arc","character/001_Gryphon.bld","level/Level_027_Tutorial.arc"]) {
  const p = parseArchive(fs.readFileSync(path.join(root, rel)));
  const w10 = p.header.flags_packed >>> 0;
  const tries = {};
  for (const bits of [5]) for (const from of ["top","low"]) {
    let bm = 0; for (const h of p.hashes) { const b = from === "top" ? (h >>> (32-bits)) : (h & ((1<<bits)-1)); bm |= (1 << b); }
    tries[from+bits] = (bm>>>0).toString(16);
  }
  // per-entry 3-bit fields?
  const groups3 = []; for (let i=0;i<10;i++) groups3.push((w10 >>> (3*i)) & 7);
  console.log(rel, "w10", w10.toString(16), "count", p.header.count, "bitmaps", JSON.stringify(tries), "3bit groups", groups3.join(""), "popcount", w10.toString(2).split("1").length-1);
}
