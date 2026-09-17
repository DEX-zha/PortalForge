import test from 'node:test';
import assert from 'node:assert/strict';
import { scanFloats, scanStrings, identifierHistogram } from '../src/research/scan.mjs';
import { bindiff } from '../src/research/bindiff.mjs';

function noise(n) {
  const b = Buffer.alloc(n);
  for (let i = 0; i < n; i++) b[i] = (i * 73 + 11) & 0xff;
  return b;
}

test('planted f32 triples are found in both byte orders with their offsets and endianness', () => {
  const buf = noise(4096);
  buf.writeFloatBE(100, 512);
  buf.writeFloatBE(20, 516);
  buf.writeFloatBE(300, 520);
  buf.writeFloatLE(-12.5, 1024);
  buf.writeFloatLE(0, 1028);
  buf.writeFloatLE(7, 1032);
  const r = scanFloats(buf, { min: -20000, max: 20000, vector: 3, endian: 'both' });
  const be = r.rows.find(x => x.offset === 512 && x.endian === 'be');
  const le = r.rows.find(x => x.offset === 1024 && x.endian === 'le');
  assert.deepEqual(be.values, [100, 20, 300]);
  assert.deepEqual(le.values, [-12.5, 0, 7]);
  assert.ok(be.score >= 0.9);
  const onlyBe = scanFloats(buf, { vector: 3, endian: 'be' });
  assert.ok(onlyBe.rows.every(x => x.endian === 'be'));
});

test('scalar scan honours the range and the 4x4 matrix scan requires a homogeneous last column or row', () => {
  const buf = Buffer.alloc(256);
  buf.writeFloatBE(50000, 0);
  buf.writeFloatBE(12.25, 8);
  const r = scanFloats(buf, { min: -1000, max: 1000, vector: 1, endian: 'be' });
  assert.ok(!r.rows.some(x => x.offset === 0));
  assert.ok(r.rows.some(x => x.offset === 8 && x.values[0] === 12.25));
  const m = Buffer.alloc(128);
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1];
  identity.forEach((v, i) => m.writeFloatBE(v, i * 4));
  const mr = scanFloats(m, { vector: 16, endian: 'be' });
  assert.equal(mr.rows[0].offset, 0);
  assert.ok(mr.rows[0].score > 1);
});

test('string scan and identifier histogram surface IGZ-like type names', () => {
  const buf = Buffer.concat([
    Buffer.alloc(20, 1),
    Buffer.from('igObjectList\0igTextureAttr2\0\0igObjectList\0', 'latin1'),
    Buffer.alloc(9, 2),
  ]);
  const s = scanStrings(buf, { min: 6 });
  assert.ok(s.rows.some(r => r.text === 'igObjectList' && r.offset === 20));
  const h = identifierHistogram(buf);
  assert.deepEqual(h[0], { token: 'igObjectList', count: 2 });
  const filtered = scanStrings(buf, { min: 6, pattern: '^ig' });
  assert.ok(filtered.rows.every(r => r.text.startsWith('ig')));
});

test('bindiff reports runs with context and decodes 4-byte runs as big-endian floats', () => {
  const a = noise(300),
    b = Buffer.from(a);
  a.writeFloatBE(1.5, 100);
  b.writeFloatBE(-123.456, 100); // all four bytes differ
  b[250] ^= 0xff;
  b[251] ^= 0xff;
  const d = bindiff(a, b, { context: 4 });
  assert.equal(d.runs, 2);
  assert.equal(d.differing_bytes, 6);
  const first = d.rows[0];
  assert.equal(first.offset, 100);
  assert.equal(first.length, 4);
  assert.equal(first.context_before.length, 8);
  assert.equal(first.old_f32be, 1.5);
  assert.ok(Math.abs(first.new_f32be + 123.456) < 1e-3);
  assert.equal(bindiff(a, a.subarray(0, 290)).size_delta, -10);
});
