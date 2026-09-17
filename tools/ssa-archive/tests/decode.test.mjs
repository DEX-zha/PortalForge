import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  lzmaEncodeChunk,
  lzmaDecode,
  LZMA_PROPS,
  encodeEntryChunks,
  decodeStoredEntry,
  entryChunkPlan,
  decodeWorkspace,
  reencodeEntry,
} from '../src/iga/decode.mjs';
import { extractToWorkspace, readManifest } from '../src/workspace/manifest.mjs';
import { rebuildFromWorkspace } from '../src/iga/writer.mjs';
import { parseArchive } from '../src/iga/reader.mjs';
import { verifyBuffer } from '../src/iga/verify.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const samples = path.resolve(here, '../../../.local/samples/DATA/files');
const gryphon = path.join(samples, 'character', '001_Gryphon.bld');
const SKIP = {
  skip: fs.existsSync(gryphon) ? false : 'fixture character/001_Gryphon.bld not extracted under .local/samples',
};

const text = n => {
  const words = ['igObjectList', 'igTextureAttr2', 'transform', 'entity', 'level'];
  let s = '';
  while (s.length < n) s += words[s.length % words.length] + ' ';
  return Buffer.from(s.slice(0, n), 'latin1');
};

test('LZMA chunk encode/decode identity with the archive properties 5d 00 80 00 00', () => {
  const data = text(20000);
  const stream = lzmaEncodeChunk(data);
  assert.ok(stream.length < data.length);
  assert.equal(Buffer.compare(lzmaDecode(stream, LZMA_PROPS, data.length), data), 0);
});

test('multi-chunk entry: encoded chunks decode back; raw fallback for incompressible data', async () => {
  const compressible = text(70000);
  const enc = encodeEntryChunks(compressible);
  assert.equal(enc.chunk_count, 3);
  assert.equal(enc.values.length, 4);
  assert.ok(enc.values.slice(0, 3).every(v => v & 0x8000));
  assert.equal(enc.values[3] * 0x800, enc.bytes.length);
  const entry = { index: 0, size: compressible.length, chunk_table_index: 0, compression: 'LZMA_CHUNKED' };
  const back = decodeStoredEntry(enc.bytes, entry, { values: enc.values, word_24: enc.values.length, word_28: 0 });
  assert.equal(Buffer.compare(back, compressible), 0);

  // Deterministic incompressible bytes: chained SHA-256 blocks.
  const { createHash } = await import('node:crypto');
  const blocks = [];
  let seed = Buffer.from('portalforge-m2-probe');
  while (blocks.reduce((n, b) => n + b.length, 0) < 40000) {
    seed = createHash('sha256').update(seed).digest();
    blocks.push(seed);
  }
  const random = Buffer.concat(blocks).subarray(0, 40000);
  const raw = encodeEntryChunks(random);
  assert.ok(
    raw.values.slice(0, 2).some(v => (v & 0x8000) === 0),
    'at least one raw chunk expected',
  );
  const back2 = decodeStoredEntry(
    raw.bytes,
    { index: 0, size: random.length, chunk_table_index: 0 },
    { values: raw.values, word_24: raw.values.length, word_28: 0 },
  );
  assert.equal(Buffer.compare(back2, random), 0);
});

test('single-chunk entry record [0x80][units] is interpreted from the record area', () => {
  const plan = entryChunkPlan(
    { index: 4, size: 4272, chunk_table_index: 0 },
    { values: [0x8000, 0x148, 0x0180, 0x0180], word_24: 2, word_28: 4 },
  );
  assert.equal(plan.kind, 'single');
  assert.equal(plan.chunks[0].compressed, true);
  assert.equal(plan.end, 0x800);
  assert.equal(plan.record_u16_index, 2);
});

test(
  'fixture: every compressed entry of 001_Gryphon.bld decodes to an IGZ file of the declared size',
  SKIP,
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-dec-'));
    const buf = fs.readFileSync(gryphon);
    extractToWorkspace(buf, { discPath: 'character/001_Gryphon.bld', sourceFile: gryphon, outDir: dir });
    const r = await decodeWorkspace(dir);
    assert.equal(r.decoded, 7);
    assert.equal(r.total, 7);
    const m = readManifest(dir);
    assert.equal(m.chunk_tables[0].confidence, 'CONFIRMED');
    for (const e of m.entries) {
      const out = fs.readFileSync(path.join(dir, e.decoded_file));
      assert.equal(out.length, e.size);
      assert.equal(out.subarray(0, 4).toString('latin1'), 'IGZ\x01');
    }
    const level = m.entries.find(e => e.name === 'level.bld');
    assert.equal(m.chunk_tables[0].decoded.entries.find(d => d.index === level.index).chunks, 40);
    fs.rmSync(dir, { recursive: true, force: true });
  },
);

test(
  'fixture: re-encoding a mutated single-chunk entry yields a VALID archive whose entry decodes to the mutation',
  SKIP,
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-reenc-'));
    const buf = fs.readFileSync(gryphon);
    const m0 = extractToWorkspace(buf, { discPath: 'character/001_Gryphon.bld', sourceFile: gryphon, outDir: dir });
    await decodeWorkspace(dir);
    const m = readManifest(dir);
    const target = m.entries.find(e => e.name === 'ENGLISH.pak');
    const data = fs.readFileSync(path.join(dir, target.decoded_file));
    const mutated = Buffer.from(data);
    mutated[mutated.length - 1] ^= 0x01; // last byte, keeps IGZ header intact
    const repl = path.join(dir, 'mutated.bin');
    fs.writeFileSync(repl, mutated);
    const r = rebuildFromWorkspace(dir, { replacements: { [target.index]: repl }, reencode: reencodeEntry });
    assert.equal(r.strategy, 'REENCODE_REPLACED');
    assert.equal(verifyBuffer(r.buffer).status, 'VALID');
    const p = parseArchive(r.buffer);
    const e = p.entries[target.index];
    const stored = r.buffer.subarray(e.start, e.start + e.stored_size);
    const back = decodeStoredEntry(stored, e, {
      values: p.chunk_area.values,
      word_24: p.header.word_24,
      word_28: p.header.word_28,
    });
    assert.equal(Buffer.compare(back, mutated), 0);
    // Untouched entries still decode identically.
    const lvl = p.entries.find(x => x.name === 'level.bld');
    const lvlBack = decodeStoredEntry(r.buffer.subarray(lvl.start, lvl.start + lvl.stored_size), lvl, {
      values: p.chunk_area.values,
      word_24: p.header.word_24,
      word_28: p.header.word_28,
    });
    assert.equal(lvlBack.length, lvl.size);
    void m0;
    fs.rmSync(dir, { recursive: true, force: true });
  },
);
