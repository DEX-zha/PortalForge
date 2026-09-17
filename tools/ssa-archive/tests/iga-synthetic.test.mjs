import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArchive, sampleEntries } from './helpers/synthetic.mjs';
import { parseArchive, summarize } from '../src/iga/reader.mjs';
import { HEADER_SIZE, ALIGN } from '../src/iga/header.mjs';

test('synthetic v4 archive parses header words, hashes, entries, names and stored sizes', () => {
  const { buf, placed, nameTableOffset, nameTableSize } = buildArchive(sampleEntries(6));
  const p = parseArchive(buf);
  assert.deepEqual(p.issues, []);
  assert.equal(p.header.version, 4);
  assert.equal(p.header.count, 6);
  assert.equal(p.header.header_words.length, 12);
  assert.equal(p.header.name_table_offset, nameTableOffset);
  assert.equal(p.header.name_table_size, nameTableSize);
  for (let i = 1; i < p.hashes.length; i++) assert.ok(p.hashes[i - 1] < p.hashes[i]);
  p.entries.forEach((e, i) => {
    assert.equal(e.name, placed[i].name);
    assert.equal(e.hash, placed[i].hash);
    assert.equal(e.start, placed[i].start);
    assert.equal(e.size, placed[i].data.length);
    assert.equal(e.compression, 'NONE');
    assert.equal(e.chunk_table_index, null);
    assert.equal(e.start % ALIGN, 0);
    assert.ok(e.stored_size >= e.size && e.stored_size % ALIGN === 0);
    assert.match(e.data_sha256, /^[0-9a-f]{64}$/);
  });
  const s = summarize(p);
  assert.equal(s.compression.NONE, 6);
  assert.equal(s.hashes_sorted, true);
});

test('lookup words: 0x10 is 0xFFFFFFFF/count and 0x14 the maximum probe distance of the sorted hashes', () => {
  const { buf } = buildArchive(sampleEntries(9));
  const p = parseArchive(buf);
  assert.equal(p.header.flags_packed, Math.floor(0xffffffff / 9));
  const est = p.hashes.map(h => Math.min(8, Math.floor(h / p.header.flags_packed)));
  assert.equal(p.header.word_14, Math.max(...p.hashes.map((h, i) => Math.abs(i - est[i]))));
  assert.deepEqual(p.issues, []);
});

test('parse is stable: Read(x) twice yields identical structures', () => {
  const { buf } = buildArchive(sampleEntries(3));
  const a = JSON.stringify(parseArchive(buf));
  const b = JSON.stringify(parseArchive(Buffer.from(buf)));
  assert.equal(a, b);
});

test('layout regions cover the whole archive exactly once with the four classes', () => {
  const { buf } = buildArchive(sampleEntries(4));
  const p = parseArchive(buf);
  let cursor = 0;
  for (const r of p.regions) {
    assert.equal(r.offset, cursor);
    assert.ok(['METADATA', 'TABLE', 'CONTENT', 'PADDING'].includes(r.class));
    cursor += r.length;
  }
  assert.equal(cursor, buf.length);
  assert.equal(p.regions[0].class, 'METADATA');
  assert.equal(p.regions[0].length, HEADER_SIZE);
});

test('compressed-mode entries expose chunk table indexes and the raw chunk area is preserved', () => {
  const entries = sampleEntries(3).map((e, i) => (i === 1 ? { ...e, mode: 0x10000002 } : e));
  const { buf } = buildArchive(entries, { chunkValues: [0x8000, 0x8004, 0x8009, 0x800d] });
  const p = parseArchive(buf);
  assert.deepEqual(p.issues, []);
  const c = p.entries.find(e => e.compression === 'LZMA_CHUNKED');
  assert.equal(c.chunk_table_index, 2);
  assert.deepEqual(p.chunk_area.values, [0x8000, 0x8004, 0x8009, 0x800d]);
  assert.equal(p.chunk_area.confidence, 'UNKNOWN');
});
