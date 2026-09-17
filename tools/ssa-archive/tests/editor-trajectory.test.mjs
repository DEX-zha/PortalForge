import test from 'node:test';
import assert from 'node:assert/strict';
import { driftingPath, translatedPathWords } from '../src/editor/trajectory.mjs';

function fixture() {
  const buffer = Buffer.alloc(1024),
    offset = 64,
    list = 400,
    array = 424,
    points = [512, 568];
  const placement = { offset, behavior: { path: 'C:/tfb/Content/Levels/Level_027/Scripts/Drifting_Piece.ai' } };
  const ptrSet = new Set([offset + 0xe4, list + 20, array, array + 4]);
  buffer.writeUInt32BE(104, offset);
  buffer.writeUInt32BE(list, offset + 0xe4);
  [147, 1, 2, 2, 0x80000008, array].forEach((v, i) => buffer.writeUInt32BE(v, list + i * 4));
  points.forEach((p, i) => {
    buffer.writeUInt32BE(p, array + i * 4);
    buffer.writeUInt32BE(148, p);
    [10 + i, 20, 30].forEach((v, a) => buffer.writeFloatBE(v, p + 0x20 + 4 * a));
  });
  [1, 2, 3].forEach((v, a) => buffer.writeFloatBE(v, offset + 0x24 + 4 * a));
  return {
    buffer,
    ptrSet,
    placements: [placement],
    graph: { object_section: 0, sections: [{ offset: 0, size: buffer.length }] },
    placement,
  };
}

test('moving a drifting anchor plans the same delta for every path point without writing other bytes', () => {
  const s = fixture(),
    original = Buffer.from(s.buffer);
  assert.equal(driftingPath(s, s.placement).points.length, 2);
  const words = translatedPathWords(s, s.placement, [5, 8, 12]);
  assert.equal(words.length, 6);
  assert.deepEqual(s.buffer, original);
  for (const w of words) s.buffer.writeUInt32BE(w.after, w.offset);
  assert.deepEqual(
    [0, 1, 2].map(a => s.buffer.readFloatBE(512 + 0x20 + 4 * a)),
    [14, 26, 39],
  );
  for (const w of words) s.buffer.writeUInt32BE(w.before, w.offset);
  assert.deepEqual(s.buffer, original);
});
test('shared paths or points are refused before any byte changes', () => {
  const s = fixture();
  s.ptrSet.add(700);
  s.buffer.writeUInt32BE(512, 700);
  const original = Buffer.from(s.buffer);
  assert.throws(() => translatedPathWords(s, s.placement, [4, 5, 6]), /shared waypoint/);
  assert.deepEqual(s.buffer, original);
});
test('unknown classes and missing pointer evidence cannot enable path editing', () => {
  const s = fixture();
  s.ptrSet.clear();
  assert.equal(driftingPath(s, s.placement).supported, false);
  s.placement.behavior.path = 'Unknown.ai';
  assert.deepEqual(translatedPathWords(s, s.placement, [4, 5, 6]), []);
});
