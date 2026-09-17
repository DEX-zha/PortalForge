import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildArchive, sampleEntries } from './helpers/synthetic.mjs';
import { extractToWorkspace, readManifest } from '../src/workspace/manifest.mjs';
import { rebuildFromWorkspace } from '../src/iga/writer.mjs';
import { diffArchives } from '../src/iga/diff.mjs';
import { verifyBuffer } from '../src/iga/verify.mjs';
import { encodeEntryChunks, reencodeEntry, decodeStoredEntry } from '../src/iga/decode.mjs';
import { parseArchive } from '../src/iga/reader.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-mut-'));

test('a same-size one-value mutation of an uncompressed entry changes exactly one CONTENT region', () => {
  const dir = tmp();
  const { buf } = buildArchive(sampleEntries(4));
  const m = extractToWorkspace(buf, { discPath: 'test/m.arc', sourceFile: path.join(dir, 'm.arc'), outDir: dir });
  const e = m.entries[1];
  const data = Buffer.from(fs.readFileSync(path.join(dir, e.file)).subarray(0, e.size));
  data.writeFloatBE(200, 16); // predicted: X 100 -> 200 style mutation
  const repl = path.join(dir, 'mut.bin');
  fs.writeFileSync(repl, data);
  const r = rebuildFromWorkspace(dir, { replacements: { 1: repl } });
  assert.equal(r.strategy, 'BYTE_PRESERVING');
  const d = diffArchives(buf, r.buffer);
  const content = d.regions.filter(x => x.class === 'CONTENT');
  assert.equal(content.length, 1);
  assert.equal(content[0].offset, e.start + 16);
  assert.ok(content[0].length <= 4);
  assert.equal(d.unclassified_bytes, 0);
  assert.equal(verifyBuffer(r.buffer).status, 'VALID');
});

test('mutating a compressed entry re-encodes only that entry: strategy REENCODE_REPLACED, other entries byte-identical', () => {
  const dir = tmp();
  const text = Buffer.from('igEntity position 100 20 300 rotation 0 0 0 '.repeat(400), 'latin1');
  const enc = encodeEntryChunks(text);
  const stored = enc.bytes;
  // Build a synthetic .bld-like archive: one compressed entry with its own u16 table, one stored entry.
  const values = [...enc.values, 0x0180];
  const entries = [
    { name: 'level.bld', data: stored, size: text.length, mode: 0x10000000 },
    { name: 'ENGLISH.pak', data: Buffer.alloc(300, 7) },
  ];
  const { buf, placed } = buildArchive(entries, { chunkValues: values, word24: enc.values.length, word28: 2 });
  const m = extractToWorkspace(buf, { discPath: 'test/m.bld', sourceFile: path.join(dir, 'm.bld'), outDir: dir });
  const target = m.entries.find(x => x.name === 'level.bld');
  const mutated = Buffer.from(text);
  mutated.write('position 200', mutated.indexOf('position 100'), 'latin1');
  const repl = path.join(dir, 'mut.bin');
  fs.writeFileSync(repl, mutated);
  const r = rebuildFromWorkspace(dir, { replacements: { [target.index]: repl }, reencode: reencodeEntry });
  assert.equal(r.strategy, 'REENCODE_REPLACED');
  assert.deepEqual(r.replaced_entries, [target.index]);
  assert.equal(verifyBuffer(r.buffer).status, 'VALID');
  const p = parseArchive(r.buffer);
  const e = p.entries[target.index];
  const back = decodeStoredEntry(r.buffer.subarray(e.start, e.start + e.stored_size), e, {
    values: p.chunk_area.values,
    word_24: p.header.word_24,
    word_28: p.header.word_28,
  });
  assert.equal(Buffer.compare(back, mutated), 0);
  const other = p.entries.find(x => x.name === 'ENGLISH.pak');
  assert.equal(Buffer.compare(r.buffer.subarray(other.start, other.start + other.size), Buffer.alloc(300, 7)), 0);
  const d = diffArchives(buf, r.buffer);
  assert.equal(d.unclassified_bytes, 0);
  assert.ok(d.regions.some(x => x.class === 'CONTENT'));
  void placed;
  void readManifest;
});
