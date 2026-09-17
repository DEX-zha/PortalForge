// Read-only diagnostic through the same bridge used by MCP memory tools.
// Not a format parser: looks only for the caller's literal byte sequence.
import fs from 'node:fs';
import path from 'node:path';
import { bridgeCall, evidence } from './runtime.mjs';
const needle = Buffer.from(process.argv[2] ?? 'th_HomeBtn_b.brlyt,th_HomeBtn_b,1,1', 'utf8');
if (!needle.length || needle.length > 65536) throw new Error('Needle must be 1..65536 bytes');
const report = { started: new Date().toISOString(), needle: needle.toString('hex'), matches: [], read_only: true };
for (const [start, end] of [
  [0x80000000, 0x81800000],
  [0x90000000, 0x94000000],
]) {
  let previous = Buffer.alloc(0);
  for (let address = start; address < end; address += 65536) {
    const bytes = Buffer.from(await bridgeCall('memory.read_bytes', [address, Math.min(65536, end - address)]), 'hex');
    const combined = Buffer.concat([previous, bytes]);
    let offset = combined.indexOf(needle);
    while (offset !== -1) {
      const found = address - previous.length + offset;
      report.matches.push('0x' + found.toString(16));
      console.log('MATCH 0x' + found.toString(16));
      offset = combined.indexOf(needle, offset + 1);
    }
    previous = combined.subarray(Math.max(0, combined.length - needle.length + 1));
    if ((address - start) % 0x400000 === 0) console.log('READ 0x' + address.toString(16));
  }
}
report.finished = new Date().toISOString();
const output = path.join(evidence, 'memory-search-' + Date.now() + '.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, ...report }));
