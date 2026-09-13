import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMapping, mapping, HANDEDNESS } from '../src/view/coords.mjs';

// Feature 003 T006. The axis convention lives in exactly one module, because a mirrored view would make every
// spatial judgement in the editor wrong while looking entirely plausible (research R7).

test('coords: the mapping is its own inverse and leaves the vertical axis alone', () => {
  const m = makeMapping({ flipX: false });
  const p = [82.25, 9.96, 41.95];
  assert.deepEqual(m.toView(p), p);
  assert.deepEqual(m.toGame(m.toView(p)), p);
  assert.equal(m.toView(p)[1], p[1], 'the vertical axis is never touched');
});

test('coords: flipping the handedness changes exactly one horizontal axis', () => {
  const p = [3, 4, 5];
  const straight = makeMapping({ flipX: false }).toView(p);
  const flipped = makeMapping({ flipX: true }).toView(p);
  const differing = straight.map((v, i) => v !== flipped[i]).filter(Boolean).length;
  assert.equal(differing, 1, 'exactly one axis differs');
  assert.equal(flipped[1], p[1], 'and it is not the vertical one');
  assert.equal(flipped[0], -p[0]);
  assert.deepEqual(makeMapping({ flipX: true }).toGame(flipped), p, 'still its own inverse when flipped');
});

test('coords: the module exports one default mapping and states which handedness it uses', () => {
  assert.equal(typeof mapping.toView, 'function');
  assert.equal(typeof mapping.toGame, 'function');
  assert.equal(typeof HANDEDNESS.flipX, 'boolean');
  assert.equal(typeof HANDEDNESS.verified, 'boolean');
  assert.deepEqual(mapping.toGame(mapping.toView([1, 2, 3])), [1, 2, 3]);
});
