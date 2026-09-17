// Spec 002 T021: a replaced multi-chunk entry that needs more chunks grows the u16 table area.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildArchive } from './helpers/synthetic.mjs';
import { extractToWorkspace, readManifest } from '../src/workspace/manifest.mjs';
import { rebuildFromWorkspace } from '../src/iga/writer.mjs';
import { parseArchive } from '../src/iga/reader.mjs';
import { verifyBuffer } from '../src/iga/verify.mjs';
import { encodeEntryChunks, reencodeEntry, decodeStoredEntry } from '../src/iga/decode.mjs';

const text = n => {
  const words = ['igObjectList', 'tfbPhysicsModel', 'PlacementReference', 'ScriptSet', 'CameraInfo'];
  let s = '';
  while (s.length < n) s += words[s.length % words.length] + ' ';
  return Buffer.from(s.slice(0, n), 'latin1');
};

test('growing a multi-chunk entry by one chunk keeps the archive VALID, decodable and shifts the following table indexes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-grow-'));
  // Two multi-chunk entries: A (2 chunks) at u16 index 0 (3 values), B (2 chunks) at index 3 (3 values), plus one stored entry.
  const dataA = text(0x8000 + 3000),
    dataB = text(0x8000 + 100);
  const encA = encodeEntryChunks(dataA),
    encB = encodeEntryChunks(dataB);
  assert.equal(encA.chunk_count, 2);
  assert.equal(encB.chunk_count, 2);
  const entries = [
    { name: 'level.bld', data: encA.bytes, size: dataA.length, mode: 0x10000000 },
    { name: 'other.bld', data: encB.bytes, size: dataB.length, mode: 0x10000000 | 3 },
    { name: 'ENGLISH.pak', data: Buffer.alloc(200, 9) },
  ];
  const { buf } = buildArchive(entries, { chunkValues: [...encA.values, ...encB.values], word24: 6, word28: 0 });
  assert.equal(verifyBuffer(buf).status, 'VALID');
  extractToWorkspace(buf, { discPath: 'test/grow.bld', sourceFile: path.join(dir, 'grow.bld'), outDir: dir });
  const m = readManifest(dir);
  const a = m.entries.find(e => e.name === 'level.bld'),
    b = m.entries.find(e => e.name === 'other.bld');
  const grown = text(2 * 0x8000 + 500); // needs 3 chunks
  const repl = path.join(dir, 'grown.bin');
  fs.writeFileSync(repl, grown);
  const r = rebuildFromWorkspace(dir, { replacements: { [a.index]: repl }, reencode: reencodeEntry });
  assert.equal(r.strategy, 'REENCODE_REPLACED');
  const v = verifyBuffer(r.buffer);
  assert.equal(v.status, 'VALID', JSON.stringify(v.failures));
  const p = parseArchive(r.buffer);
  assert.equal(p.header.word_24, 7); // 4 + 3 values
  assert.equal(p.header.table_size, 16 * 3 + 2 * 7);
  const pa = p.entries[a.index],
    pb = p.entries[b.index];
  assert.equal(pb.chunk_table_index, 4); // shifted by one
  const tables = { values: p.chunk_area.values, word_24: p.header.word_24, word_28: p.header.word_28 };
  assert.equal(
    Buffer.compare(decodeStoredEntry(r.buffer.subarray(pa.start, pa.start + pa.stored_size), pa, tables), grown),
    0,
  );
  assert.equal(
    Buffer.compare(decodeStoredEntry(r.buffer.subarray(pb.start, pb.start + pb.stored_size), pb, tables), dataB),
    0,
  );
  const eng = p.entries.find(e => e.name === 'ENGLISH.pak');
  assert.equal(Buffer.compare(r.buffer.subarray(eng.start, eng.start + eng.size), Buffer.alloc(200, 9)), 0);
});
