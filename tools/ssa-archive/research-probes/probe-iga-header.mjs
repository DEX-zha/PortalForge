import fs from "node:fs";
for (const file of ["character/001_Gryphon.arc","character/001_Gryphon.bld","level/Level_027_Tutorial.arc"]) {
  const b = fs.readFileSync("../../.local/samples/DATA/files/" + file);
  const u32 = o => b.readUInt32LE(o);
  const count = u32(0x0c), ntLoc = u32(0x18), ntLen = u32(0x1c);
  const hashes = Array.from({length: count}, (_, i) => u32(0x30 + 4*i));
  const local = 0x30 + 4*count;
  const entries = Array.from({length: count}, (_, i) => ({start: u32(local+12*i), size: u32(local+12*i+4), mode: u32(local+12*i+8)}));
  const names = Array.from({length: count}, (_, i) => { const off = u32(ntLoc + 4*i); const end = b.indexOf(0, ntLoc + off); return b.toString("latin1", ntLoc + off, end); });
  const sorted = hashes.every((h, i) => i === 0 || hashes[i-1] < h);
  const modes = {}; for (const e of entries) { const k = (e.mode >>> 24).toString(16); modes[k] = (modes[k]||0)+1; }
  const tablesEnd = local + 12*count;
  const firstData = Math.min(...entries.map(e => e.start));
  const dataEnd = Math.max(...entries.map(e => e.start + e.size));
  console.log(JSON.stringify({file, size: b.length, count, hdr08: u32(8), hdr10: u32(0x10).toString(16), hdr14: u32(0x14), hdr24: u32(0x24), hdr28: u32(0x28), ntLoc, ntLen, ntEnd: ntLoc+ntLen, hashesSorted: sorted, tablesEnd, firstData, dataEndVsNt: dataEnd - ntLoc, modesByHighByte: modes, first3: entries.slice(0,3).map((e,i)=>({...e, mode: e.mode.toString(16), name: names[i]})), lastName: names[count-1], alignment0x800: entries.every(e => e.start % 0x800 === 0)}));
}

