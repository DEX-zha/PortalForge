import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIgz } from './helpers/synthetic-igz.mjs';
import { buildGraph } from '../src/igz/graph.mjs';
import { positionCandidates, near, isDimensionTriple, isBoxPair, fieldStatistics } from '../src/igz/entities.mjs';
import { matchAddress, matchPattern, owner } from '../src/igz/match.mjs';

const sample = () => buildIgz({ objects: [
  { type: 4, size: 0x40, fields: [{ at: 0x20, f32: 91.73 }, { at: 0x24, f32: 10.31 }, { at: 0x28, f32: 44.74 }] },
  { type: 3, size: 0x40, fields: [{ at: 0x10, f32: 91.44 }, { at: 0x14, f32: 0 }, { at: 0x18, f32: 45.72 }] },          // 300 ft, 150 ft: dimensions
  { type: 3, size: 0x50, fields: [{ at: 0x10, f32: 91.27 }, { at: 0x14, f32: 3.22 }, { at: 0x18, f32: 43.18 }, { at: 0x1c, f32: 95.43 }, { at: 0x20, f32: 8.17 }, { at: 0x24, f32: 46.57 }] }, // box
] });

test('dimension triples (multiples of 1.524) and box pairs are recognised', () => {
  assert.equal(isDimensionTriple([91.44, 0, 45.72]), true);
  assert.equal(isDimensionTriple([91.73, 10.31, 44.74]), false);
  assert.equal(isBoxPair([91.27, 3.22, 43.18], [95.43, 8.17, 46.57]), true);
  assert.equal(isBoxPair([95, 8, 46], [91, 3, 43]), false);
});

test('near ranks the real position first and excludes dimensions by default', () => {
  const { buf, objectOffsets } = sample();
  const g = buildGraph(buf);
  const rows = near(buf, g, [91.34, 10.55, 44.22], { tol: 3 });
  assert.equal(rows[0].object.offset, objectOffsets[0]);
  assert.equal(rows[0].field, 0x20);
  assert.ok(!rows.some(r => r.flags.includes('dimension')));
  const withDims = near(buf, g, [91.34, 10.55, 44.22], { tol: 12, includeDimensions: true });
  assert.ok(withDims.some(r => r.flags.includes('dimension')));
  const box = positionCandidates(buf, g.objects[2]).find(c => c.field === 0x10);
  assert.ok(box.flags.includes('box_min'));
  assert.ok(fieldStatistics(buf, g).some(s => s.type_name === 'tfbPhysicsModel' && s.field === 0x20));
});

test('RAM address and byte pattern map to the owning object and field', () => {
  const { buf, objectOffsets } = sample();
  const g = buildGraph(buf);
  const base = 0x80DBC020;
  const m = matchAddress(g, base + objectOffsets[0] + 0x20, { base });
  assert.equal(m.object.type_name, 'tfbPhysicsModel'); assert.equal(m.field, 0x20);
  assert.equal(matchAddress(g, base + 4, { base }).object, null);
  const pat = buf.subarray(objectOffsets[0] + 0x20, objectOffsets[0] + 0x2c).toString('hex');
  const p = matchPattern(buf, g, pat);
  assert.equal(p.hits[0].object.offset, objectOffsets[0]);
  assert.equal(owner(g, objectOffsets[1] + 0x10).object.type_name, 'PlacementReference');
});
