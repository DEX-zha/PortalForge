import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArchive, sampleEntries } from './helpers/synthetic.mjs';
import { diffArchives } from '../src/iga/diff.mjs';
import { parseArchive } from '../src/iga/reader.mjs';
import { HEADER_SIZE } from '../src/iga/header.mjs';

const flip = (buf, offset) => {
  const b = Buffer.from(buf);
  b[offset] ^= 0xff;
  return b;
};

test('identical archives produce an empty diff', () => {
  const { buf } = buildArchive(sampleEntries(3));
  const d = diffArchives(buf, Buffer.from(buf));
  assert.deepEqual(d.regions, []);
  assert.equal(d.size_delta, 0);
  assert.equal(d.unclassified_bytes, 0);
});

test('each injected difference is classified as METADATA, TABLE, CONTENT or PADDING with 0 unclassified bytes', () => {
  const { buf, placed } = buildArchive(sampleEntries(3));
  const p = parseArchive(buf);
  const cases = [
    [0x14, 'METADATA'], // header word
    [HEADER_SIZE + 4, 'TABLE'], // hash table
    [placed[0].start + 3, 'CONTENT'], // entry data
    [placed[0].start + placed[0].data.length + 1, 'PADDING'], // alignment padding after entry 0
    [p.name_table.offset + 4 * 3 + 2, 'TABLE'], // name string
  ];
  for (const [offset, cls] of cases) {
    const d = diffArchives(buf, flip(buf, offset));
    assert.equal(d.regions.length, 1, `one region for ${cls}`);
    assert.equal(d.regions[0].class, cls, `offset ${offset}`);
    assert.equal(d.regions[0].offset, offset);
    assert.equal(d.regions[0].length, 1);
    assert.match(d.regions[0].old_hex, /^[0-9a-f]{2}$/);
    assert.equal(d.unclassified_bytes, 0);
  }
});

test('a run spanning two regions is split at the boundary and size changes are reported', () => {
  const { buf, placed } = buildArchive(sampleEntries(2));
  const b = Buffer.from(buf);
  const end = placed[0].start + placed[0].data.length;
  for (let o = end - 2; o < end + 2; o++) b[o] ^= 0x11; // 2 content bytes + 2 padding bytes
  const d = diffArchives(buf, b);
  assert.deepEqual(
    d.regions.map(r => [r.class, r.length]),
    [
      ['CONTENT', 2],
      ['PADDING', 2],
    ],
  );
  const truncated = diffArchives(buf, buf.subarray(0, buf.length - 7));
  assert.equal(truncated.size_delta, -7);
  assert.equal(truncated.unclassified_bytes, 0);
  const appended = diffArchives(buf, Buffer.concat([buf, Buffer.alloc(9, 1)]));
  assert.equal(appended.size_delta, 9);
  assert.equal(appended.regions.at(-1).class, 'PADDING');
});
