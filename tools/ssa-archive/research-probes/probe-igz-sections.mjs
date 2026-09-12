// T051 probe: per IGZ section, look for big-endian float quadruples that look like world positions
// (|x| or |z| in [50, 20000], w in {0, 1}) and for igTransform-like 4x4 matrices with a large
// translation row. Read-only diagnostic over a decoded level.bld.
import fs from 'node:fs';
const file = process.argv[2] ?? '../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded';
const buf = fs.readFileSync(file);
const sections = [];
for (let o = 0x10; o + 16 <= 0x800; o += 16) { const off = buf.readUInt32BE(o); if (!off) break; sections.push({ index: sections.length, offset: off, size: buf.readUInt32BE(o + 4), align: buf.readUInt32BE(o + 8), tag: buf.readUInt32BE(o + 12) }); }
console.log('sections:', sections.map(s => `#${s.index} @0x${s.offset.toString(16)} size=0x${s.size.toString(16)} align=${s.align} tag=${s.tag}`).join(' | '));
const plausible = v => Number.isFinite(v) && Math.abs(v) < 1e6 && (v === 0 || Math.abs(v) > 1e-5);
for (const s of sections) {
  const end = Math.min(buf.length, s.offset + s.size);
  let quads = 0, matrices = 0; const samplesQ = [], samplesM = [];
  for (let o = s.offset; o + 16 <= end; o += 4) {
    const x = buf.readFloatBE(o), y = buf.readFloatBE(o + 4), z = buf.readFloatBE(o + 8), w = buf.readFloatBE(o + 12);
    if (![x, y, z, w].every(plausible)) continue;
    if ((w === 0 || w === 1) && (Math.abs(x) >= 50 || Math.abs(z) >= 50) && Math.abs(x) <= 20000 && Math.abs(z) <= 20000 && Math.abs(y) <= 20000) {
      quads++; if (samplesQ.length < 6) samplesQ.push(`0x${o.toString(16)} [${[x, y, z, w].map(v => Math.round(v * 100) / 100).join(', ')}]`);
    }
    if (o + 64 <= end) {
      const m = []; for (let i = 0; i < 16; i++) m.push(buf.readFloatBE(o + 4 * i));
      if (m.every(plausible) && m[3] === 0 && m[7] === 0 && m[11] === 0 && m[15] === 1 && (Math.abs(m[12]) >= 50 || Math.abs(m[14]) >= 50) && Math.abs(m[12]) <= 20000 && Math.abs(m[14]) <= 20000
          && Math.abs(m[0]) <= 2 && Math.abs(m[5]) <= 2 && Math.abs(m[10]) <= 2) {
        matrices++; if (samplesM.length < 6) samplesM.push(`0x${o.toString(16)} T=[${[m[12], m[13], m[14]].map(v => Math.round(v * 100) / 100).join(', ')}] diag=[${[m[0], m[5], m[10]].map(v => Math.round(v * 1000) / 1000).join(', ')}]`);
      }
    }
  }
  console.log(`section #${s.index}: position-like quads=${quads}, row-major matrices with large translation=${matrices}`);
  for (const q of samplesQ) console.log('   quad ' + q);
  for (const m of samplesM) console.log('   mat  ' + m);
}
