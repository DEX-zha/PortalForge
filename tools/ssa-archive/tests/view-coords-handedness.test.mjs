import test from 'node:test';
import assert from 'node:assert/strict';
import { mapping, HANDEDNESS } from '../src/view/coords.mjs';

// Feature 003 T024. The handedness of the horizontal plane, settled from four in-game observations rather than
// from an impression of a rendered view. Each one comes from a boot that was judged against a prediction:
//
//   1. m2-...-o1734528-1789248814839 (2 identical runs, M2 PASS): the spawn x moved +8 and Sonic Boom appeared
//      "displaced toward screen left".
//   2. m2-...-o3296360-1789305999607 and -1789307182968 (2 identical runs): Windmill_Blades2 x moved 85.52 -> 79.5
//      and the blades appeared "displaced to the screen-right of the hub".
//   3. m3-...-1789303984407 and -1789304493862 (2 identical runs): a sunflower copied to x 85.5 appeared to the
//      left of the originals at x 82.25 and 79.68.
//   4. m3-...-1789304824550: sunflower(2) moved x 79.68 -> 88 and z 40.94 -> 44 and appeared "further left, in
//      front of the windmill door"; the windmill sits at z 50.33, so +z is away from the camera.
//
// Observation 4 fixes the view direction as +z, observations 1 to 3 fix screen-right as -x. For a camera with
// forward f and up u, the screen-right vector is f x u. With f = (0,0,1) and u = (0,1,0) that cross product is
// (-1,0,0) in a RIGHT-handed system and (+1,0,0) in a left-handed one. The game shows -x, so the game is
// right-handed with y up, exactly like three.js, and the identity mapping preserves chirality: no mirror.
//
// This test encodes the derivation so that flipping the flag cannot pass unnoticed.

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// Where a world point lands on the horizontal screen axis, for a camera looking along `forward` with y up.
function screenX(worldPoint, { eye = [0, 0, 0], forward = [0, 0, 1] } = {}) {
  const right = cross(forward, [0, 1, 0]);
  return dot(sub(mapping.toView(worldPoint), mapping.toView(eye)), right);
}

// The camera of the tutorial's opening shot: behind the spawn, looking toward the windmill.
const CAMERA = { eye: [91.73, 12, 30], forward: [0, 0, 1] };

test('handedness: a larger x lands further left on screen, as four booted runs observed', () => {
  const spawn = [91.73, 10.31, 44.74];
  const movedPlusX = [99.73, 10.31, 44.74];                       // observation 1: spawn x +8 went screen-left
  assert.ok(screenX(movedPlusX, CAMERA) < screenX(spawn, CAMERA), '+x must be screen-left');

  const bladesBefore = [85.52, 22.14, 50.33], bladesAfter = [79.5, 22.14, 50.33];
  assert.ok(screenX(bladesAfter, CAMERA) > screenX(bladesBefore, CAMERA), 'observation 2: -x went screen-right');

  const sun1 = [82.25, 9.96, 41.95], sun2 = [79.68, 10.46, 40.94], copy = [85.5, 10, 42];
  const order = [copy, sun1, sun2].map(p => screenX(p, CAMERA));
  assert.ok(order[0] < order[1] && order[1] < order[2], 'observation 3: the copy at the largest x is leftmost');
});

test('handedness: +z moves a prop away from the camera, toward the windmill', () => {
  const before = [79.68, 10.46, 40.94], after = [88, 10.3, 44];    // observation 4
  const depth = p => p[2];
  assert.ok(depth(mapping.toView(after)) > depth(mapping.toView(before)), '+z is deeper into the scene');
  assert.ok(screenX(after, CAMERA) < screenX(before, CAMERA), 'and the same move went screen-left');
});

test('handedness: the flag records that this is settled, and by what', () => {
  assert.equal(HANDEDNESS.flipX, false, 'the game is right-handed with y up, like three.js: no mirror');
  assert.equal(HANDEDNESS.verified, true, 'settled by four judged in-game runs, not by an impression');
  assert.match(HANDEDNESS.note, /m2-|m3-/, 'the note names the runs it rests on');
});
