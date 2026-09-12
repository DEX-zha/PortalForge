import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildArchive, sampleEntries } from './helpers/synthetic.mjs';
import { extractToWorkspace } from '../src/workspace/manifest.mjs';
import { rebuildFromWorkspace } from '../src/iga/writer.mjs';
import { parseArchive } from '../src/iga/reader.mjs';
import { verifyBuffer } from '../src/iga/verify.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-rt-'));
const structural = buf => { const p = parseArchive(buf); return JSON.stringify({ h: p.header.header_words, hashes: p.hashes, entries: p.entries.map(e => [e.name, e.hash, e.start, e.size, e.mode]), names: p.name_table.offsets }); };

test('rebuild(extract(archive)) is byte-identical for uncompressed synthetic archives', () => {
  const dir = tmp();
  const { buf } = buildArchive(sampleEntries(6));
  extractToWorkspace(buf, { discPath: 'test/a.arc', sourceFile: path.join(dir, 'a.arc'), outDir: dir });
  const r = rebuildFromWorkspace(dir);
  assert.equal(r.strategy, 'BYTE_PRESERVING');
  assert.deepEqual(r.replaced_entries, []);
  assert.equal(Buffer.compare(r.buffer, buf), 0);
});

test('Read(Write(Read(x))) equals Read(x) structurally and stays VALID', () => {
  const dir = tmp();
  const { buf } = buildArchive(sampleEntries(4));
  extractToWorkspace(buf, { discPath: 'test/b.arc', sourceFile: path.join(dir, 'b.arc'), outDir: dir });
  const out = rebuildFromWorkspace(dir).buffer;
  assert.equal(structural(out), structural(buf));
  assert.equal(verifyBuffer(out).status, 'VALID');
});

test('raw chunk areas and non-zero gap bytes are reproduced verbatim', () => {
  const dir = tmp();
  const entries = sampleEntries(3).map((e, i) => i === 0 ? { ...e, mode: 0x10000000 } : e);
  const { buf } = buildArchive(entries, { chunkValues: [0x8000, 0x8003, 0x8007] });
  // Plant non-zero bytes in the gap after the tables, as real archives do.
  buf.writeUInt32LE(0x00414dec, 0x30 + 16 * 3 + 6);
  extractToWorkspace(buf, { discPath: 'test/c.bld', sourceFile: path.join(dir, 'c.bld'), outDir: dir });
  assert.equal(Buffer.compare(rebuildFromWorkspace(dir).buffer, buf), 0);
});

test('same-size replacement changes only the targeted entry bytes and keeps offsets', () => {
  const dir = tmp();
  const { buf } = buildArchive(sampleEntries(4));
  const manifest = extractToWorkspace(buf, { discPath: 'test/d.arc', sourceFile: path.join(dir, 'd.arc'), outDir: dir });
  const target = manifest.entries[2];
  const data = fs.readFileSync(path.join(dir, target.file)).subarray(0, target.size);
  const mutated = Buffer.from(data); mutated[10] ^= 0x5A;
  const repl = path.join(dir, 'repl.bin'); fs.writeFileSync(repl, mutated);
  const r = rebuildFromWorkspace(dir, { replacements: { 2: repl } });
  assert.deepEqual(r.replaced_entries, [2]);
  assert.equal(r.buffer.length, buf.length);
  let diffs = 0; for (let i = 0; i < buf.length; i++) if (buf[i] !== r.buffer[i]) diffs++;
  assert.equal(diffs, 1);
  assert.equal(r.buffer[target.start + 10], mutated[10]);
});

test('different-size replacement relayouts entries on 0x800 boundaries and stays VALID', () => {
  const dir = tmp();
  const { buf } = buildArchive(sampleEntries(4));
  const manifest = extractToWorkspace(buf, { discPath: 'test/e.arc', sourceFile: path.join(dir, 'e.arc'), outDir: dir });
  const repl = path.join(dir, 'big.bin'); fs.writeFileSync(repl, Buffer.alloc(manifest.entries[1].size + 5000, 0xAB));
  const r = rebuildFromWorkspace(dir, { replacements: { 1: repl } });
  const p = parseArchive(r.buffer);
  assert.equal(verifyBuffer(r.buffer).status, 'VALID');
  assert.equal(p.entries[1].size, manifest.entries[1].size + 5000);
  assert.deepEqual(p.entries.map(e => e.name), manifest.entries.map(e => e.name));
  assert.deepEqual(p.hashes, manifest.hashes);
});

test('sequential layout with padding is byte-different, structurally equivalent and VALID', () => {
  const dir = tmp();
  const { buf } = buildArchive(sampleEntries(5));
  extractToWorkspace(buf, { discPath: 'test/g.arc', sourceFile: path.join(dir, 'g.arc'), outDir: dir });
  const r = rebuildFromWorkspace(dir, { layout: 'sequential', padUnits: 1 });
  assert.equal(r.relayout, true);
  assert.equal(r.buffer.length, buf.length + 0x800);
  assert.notEqual(Buffer.compare(r.buffer, buf), 0);
  assert.equal(verifyBuffer(r.buffer).status, 'VALID');
  const a = parseArchive(buf), b = parseArchive(r.buffer);
  assert.deepEqual(b.entries.map(e => [e.name, e.hash, e.size, e.mode]), a.entries.map(e => [e.name, e.hash, e.size, e.mode]));
  b.entries.forEach((e, i) => assert.equal(Buffer.compare(r.buffer.subarray(e.start, e.start + e.size), buf.subarray(a.entries[i].start, a.entries[i].start + a.entries[i].size)), 0));
  // Entries now follow entry-table order.
  for (let i = 1; i < b.entries.length; i++) assert.ok(b.entries[i].start > b.entries[i - 1].start);
});

test('replacing a compressed entry without a confirmed re-encoder is refused explicitly', () => {
  const dir = tmp();
  const entries = sampleEntries(2).map((e, i) => i === 0 ? { ...e, mode: 0x10000000 } : e);
  const { buf } = buildArchive(entries, { chunkValues: [0x8000, 0x8001] });
  const m = extractToWorkspace(buf, { discPath: 'test/f.bld', sourceFile: path.join(dir, 'f.bld'), outDir: dir });
  const idx = m.entries.findIndex(e => e.compression === 'LZMA_CHUNKED');
  const repl = path.join(dir, 'x.bin'); fs.writeFileSync(repl, Buffer.alloc(10));
  assert.throws(() => rebuildFromWorkspace(dir, { replacements: { [idx]: repl } }), /REENCODE_NOT_AVAILABLE/);
});
