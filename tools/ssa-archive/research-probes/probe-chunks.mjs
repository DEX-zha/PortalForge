// T033 probe: decode compressed entries of real .bld archives to establish chunk semantics.
// Observed chunk layout: [u16 BE compressed size][5-byte LZMA props 5d 00 80 00 00][stream].
// Hypothesis A (multi-chunk entries): chunk table values v[i] (u16 LE) give chunk i offset as
// (v & 0x7fff) * 0x800 from the entry start, bit 15 = chunk is LZMA compressed, last value = end.
// Hypothesis B (single-chunk entries): one chunk at the entry start, no table needed.
import fs from 'node:fs';
import path from 'node:path';
import { decompress } from 'lzma1';
import { parseArchive } from '../src/iga/reader.mjs';

const file = process.argv[2] ?? '../../.local/samples/DATA/files/character/001_Gryphon.bld';
const outDir = process.argv[3];
const buf = fs.readFileSync(path.resolve(file));
const p = parseArchive(buf);
const values = p.chunk_area?.values ?? [];
console.log(`${path.basename(file)}: ${values.length} chunk values, table_size=0x${p.header.table_size.toString(16)}`);
for (const e of p.entries) console.log(`  entry ${e.index} ${e.name} start=0x${e.start.toString(16)} size=${e.size} stored=${e.stored_size} mode=0x${e.mode.toString(16)} chunks=${Math.ceil(e.size / 0x8000)}`);

function validProps(props) { return props[0] === 0x5D && props.readUInt32LE(1) <= 0x8000 && props.readUInt32LE(1) >= 0x1000; }
function lzmaDecode(stream, props, size) {
  const header = Buffer.alloc(13); props.copy(header, 0); header.writeBigUInt64LE(BigInt(size), 5);
  return Buffer.from(decompress(new Uint8Array(Buffer.concat([header, stream]))));
}
function decodeCompressedChunk(abs, want) {
  const csize = buf.readUInt16BE(abs), props = buf.subarray(abs + 2, abs + 7);
  if (!validProps(props)) return { error: `invalid props ${props.toString('hex')} at 0x${abs.toString(16)}` };
  try {
    const out = lzmaDecode(buf.subarray(abs + 7, abs + 7 + csize), props, want);
    return { data: out, csize, props: props.toString('hex'), used: 7 + csize, ok: out.length === want };
  } catch (err) { return { error: err.message }; }
}

for (const e of p.entries) {
  const nChunks = Math.ceil(e.size / 0x8000);
  const parts = []; let remaining = e.size; const notes = [];
  if (nChunks === 1) {
    const r = decodeCompressedChunk(e.start, e.size);
    if (r.error) notes.push('single chunk at entry start: ' + r.error); else { parts.push(r.data); remaining -= r.data.length; notes.push(`single chunk csize=${r.csize} props=${r.props} used=${r.used} (stored ${e.stored_size})`); }
  } else {
    const tbl = values.slice(e.chunk_table_index, e.chunk_table_index + nChunks + 1);
    notes.push(`table idx ${e.chunk_table_index}: ${tbl.slice(0, 4).map(v => '0x' + v.toString(16)).join(',')} … ${tbl.slice(-2).map(v => '0x' + v.toString(16)).join(',')}`);
    for (let i = 0; i < nChunks; i++) {
      const v = tbl[i]; const abs = e.start + (v & 0x7fff) * 0x800; const want = Math.min(0x8000, remaining);
      if (v & 0x8000) {
        const r = decodeCompressedChunk(abs, want);
        if (r.error) { notes.push(`chunk ${i} @0x${abs.toString(16)}: ${r.error}`); break; }
        parts.push(r.data); remaining -= r.data.length;
        const nextExpected = Math.ceil((abs + r.used) / 0x800) * 0x800;
        const nextActual = e.start + (tbl[i + 1] & 0x7fff) * 0x800;
        if (nextExpected !== nextActual) notes.push(`chunk ${i}: next expected 0x${nextExpected.toString(16)} but table says 0x${nextActual.toString(16)}`);
      } else {
        parts.push(buf.subarray(abs, abs + want)); remaining -= want;
        const nextActual = e.start + (tbl[i + 1] & 0x7fff) * 0x800;
        if (abs + want !== nextActual && i < nChunks - 1) notes.push(`raw chunk ${i}: next expected 0x${(abs + want).toString(16)} table 0x${nextActual.toString(16)}`);
      }
    }
    const endUnits = (tbl[nChunks] & 0x7fff) * 0x800;
    notes.push(`terminator 0x${(tbl[nChunks] ?? 0).toString(16)} => end offset ${endUnits} vs stored ${e.stored_size}`);
  }
  const data = Buffer.concat(parts);
  const head = data.subarray(0, 12);
  console.log(`${e.name}: decoded ${data.length}/${e.size} ${data.length === e.size ? 'OK' : 'INCOMPLETE'} head=${head.toString('hex')} "${head.toString('latin1').replace(/[^\x20-\x7e]/g, '.')}"`);
  for (const n of notes) console.log('    ' + n);
  if (outDir && data.length === e.size) { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, e.name), data); }
}
console.log('trailing values:', values.slice(-8).map(v => '0x' + v.toString(16)).join(' '));
