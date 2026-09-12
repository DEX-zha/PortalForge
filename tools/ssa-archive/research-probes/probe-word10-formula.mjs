import fs from "node:fs"; import path from "node:path";
import { parseArchive } from "../src/iga/reader.mjs";
// 1) word 0x10 == floor(0xFFFFFFFF / count) over the full survey
const rows = fs.readFileSync("../../.local/disc/level-headers.jsonl","utf8").trim().split(/\r?\n/).map(l => JSON.parse(l.replace(/^﻿/,"")));
let ok = 0, bad = [];
for (const r of rows) { const expect = Math.floor(0xFFFFFFFF / r.count); if ((r.words[4]>>>0) === expect) ok++; else bad.push({path:r.path,count:r.count,w10:r.words[4].toString(16),expect:expect.toString(16)}); }
console.log(`w10 == floor(0xFFFFFFFF/count): ${ok}/${rows.length}`, bad.slice(0,5));
// 2) word 0x14 hypotheses on local samples with hashes available
const root = "../../.local/samples/DATA/files";
for (const rel of ["character/001_Gryphon.arc","character/001_Gryphon.bld","level/Level_027_Tutorial.arc","level/Level_027_Tutorial.bld","level/Level_000_Mining.bld","level/Challenge_Level_000.bld","level/Challenge_Level_001.bld"]) {
  const p = parseArchive(fs.readFileSync(path.join(root, rel)));
  const n = p.header.count, w10 = p.header.flags_packed >>> 0, w14 = p.header.word_14;
  let maxFwd = 0, maxBack = 0, maxAbs = 0, collisions = 0;
  const est = p.hashes.map(h => Math.min(n-1, Math.floor((h>>>0) / w10)));
  p.hashes.forEach((h,i) => { const d = i - est[i]; maxFwd = Math.max(maxFwd, d); maxBack = Math.max(maxBack, -d); maxAbs = Math.max(maxAbs, Math.abs(d)); });
  const buckets = new Map(); for (const e of est) buckets.set(e,(buckets.get(e)??0)+1); const maxBucket = Math.max(...buckets.values());
  console.log(rel.padEnd(34), `count=${n} w14=${w14} maxFwd=${maxFwd} maxBack=${maxBack} maxAbs=${maxAbs} maxBucket=${maxBucket}`);
}
