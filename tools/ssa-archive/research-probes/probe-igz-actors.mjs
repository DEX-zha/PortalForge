import fs from "node:fs";
const b = fs.readFileSync("../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded");
const u32 = o => b.readUInt32BE(o), f32 = o => b.readFloatBE(o);
const S2 = 0x4579c0, S2END = S2 + 0x337fc;
const { names, objects } = JSON.parse(fs.readFileSync("../../.local/workspaces/tutorial-bld/igz-objects.json", "utf8"));
const isStr = p => p > S2 && p < S2END && b[p - 1] === 0 && b[p] >= 0x21 && b[p] <= 0x7e;
const str = p => { const e = b.indexOf(0, p); return b.toString("latin1", p, Math.min(e, p + 50)); };
// which object precedes the position-pair region?
for (const target of [0x115b80, 0x11696c, 0x116c3c]) { let prev = null; for (const o of objects) { if (o.offset <= target) prev = o; else break; } console.log(`0x${target.toString(16)} inside object @0x${prev.offset.toString(16)} type=${prev.name} (+0x${(target - prev.offset).toString(16)})`); }
// count objects around that region by type
const around = objects.filter(o => o.offset > 0x110000 && o.offset < 0x120000); const h = new Map(); for (const o of around) h.set(o.name, (h.get(o.name) ?? 0) + 1); console.log("types 0x110000-0x120000:", [...h.entries()].map(([k, v]) => k + ":" + v).join(" "));
// full dump of ActorWaypoint / tfbActorInfo / OpSpawn objects: floats and strings (skip zero refs)
for (const w of ["ActorWaypoint", "tfbActorInfo", "OpSpawn", "OpTeleportTo"]) {
  const list = objects.filter(o => o.name === w);
  console.log(`\n== ${w} (${list.length})`);
  for (const ob of list.slice(0, 7)) {
    const next = objects.find(x => x.offset > ob.offset); const size = Math.min(next ? next.offset - ob.offset : 0x100, 0x140);
    const parts = []; for (let q = 12; q < size; q += 4) { const v = u32(ob.offset + q); if (v && isStr(S2 + v)) { parts.push(`"${str(S2 + v)}"`); continue; } const f = f32(ob.offset + q); if (Number.isFinite(f) && Math.abs(f) >= 0.5 && Math.abs(f) < 20000 && Math.abs(f) !== 1) parts.push(f.toFixed(2)); else if (v < 0x10000 && v !== 0) parts.push("#" + v); }
    console.log(`  @0x${ob.offset.toString(16)} (${size}B): ${parts.join(" ")}`);
  }
}
