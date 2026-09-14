import test from 'node:test';
import assert from 'node:assert/strict';
import { BINDINGS, isBound, speedFor, step, MAX_DT, BASE_SPEED, FAST, SLOW } from '../src/view/navigate.mjs';

// Feature 004. A level holds models big enough to swallow the camera, and orbiting cannot get out of one. The
// movement is pure arithmetic and is checked here; what the scene does with it is apply it to the camera and
// the orbit target together.

const BASIS = { forward: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0] };
const held = (...keys) => new Set(keys);

test('navigate: nothing held, nothing happens', () => {
  assert.deepEqual(step({ held: held(), dt: 0.1, speed: 100, ...BASIS }), [0, 0, 0]);
  assert.deepEqual(step({}), [0, 0, 0]);
});

test('navigate: the arrows move along the camera axes, page keys along world up', () => {
  assert.deepEqual(step({ held: held('ArrowUp'), dt: 0.1, speed: 100, ...BASIS }), [0, 0, -10]);
  assert.deepEqual(step({ held: held('ArrowDown'), dt: 0.1, speed: 100, ...BASIS }), [0, 0, 10]);
  assert.deepEqual(step({ held: held('ArrowRight'), dt: 0.1, speed: 100, ...BASIS }), [10, 0, 0]);
  assert.deepEqual(step({ held: held('ArrowLeft'), dt: 0.1, speed: 100, ...BASIS }), [-10, 0, 0]);
  assert.deepEqual(step({ held: held('PageUp'), dt: 0.1, speed: 100, ...BASIS }), [0, 10, 0]);
  assert.deepEqual(step({ held: held('PageDown'), dt: 0.1, speed: 100, ...BASIS }), [0, -10, 0]);
});

test('navigate: opposite keys cancel, and a diagonal is not faster than a straight line', () => {
  assert.deepEqual(step({ held: held('ArrowUp', 'ArrowDown'), dt: 0.1, speed: 100, ...BASIS }), [0, 0, 0]);
  const d = step({ held: held('ArrowUp', 'ArrowRight'), dt: 0.1, speed: 100, ...BASIS });
  assert.ok(Math.abs(Math.hypot(...d) - 10) < 1e-9, `diagonal travelled ${Math.hypot(...d)}`);
  const three = step({ held: held('ArrowUp', 'ArrowRight', 'PageUp'), dt: 0.1, speed: 100, ...BASIS });
  assert.ok(Math.abs(Math.hypot(...three) - 10) < 1e-9);
});

test('navigate: a key that is not bound is ignored, so typing never flies the camera', () => {
  assert.deepEqual(step({ held: held('a', 'Shift', 'w'), dt: 0.1, speed: 100, ...BASIS }), [0, 0, 0]);
  assert.equal(isBound('ArrowUp'), true);
  assert.equal(isBound('w'), false, 'w is the move gizmo');
  assert.equal(isBound('constructor'), false, 'an inherited property name is not a binding');
  assert.deepEqual(Object.keys(BINDINGS).filter(k => /^[a-z]$/i.test(k)), [], 'no single letter is bound');
});

test('navigate: distance is speed times the frame, and one long frame cannot teleport the camera', () => {
  assert.deepEqual(step({ held: held('ArrowUp'), dt: 0.05, speed: 100, ...BASIS }), [0, 0, -5]);
  const long = step({ held: held('ArrowUp'), dt: 30, speed: 100, ...BASIS });
  assert.deepEqual(long, [0, 0, -100 * MAX_DT], 'a background tab hands back one huge frame; it is clamped');
  assert.deepEqual(step({ held: held('ArrowUp'), dt: 0, speed: 100, ...BASIS }), [0, 0, 0]);
  assert.deepEqual(step({ held: held('ArrowUp'), dt: 0.1, speed: 0, ...BASIS }), [0, 0, 0]);
});

test('navigate: speed follows the level size, so a big level is not slower to cross', () => {
  assert.equal(speedFor(489), 489 * BASE_SPEED);
  assert.equal(speedFor(489, { fast: true }), 489 * BASE_SPEED * FAST);
  assert.equal(speedFor(489, { slow: true }), 489 * BASE_SPEED * SLOW);
  assert.ok(speedFor(0) > 0, 'an empty level still moves');
  for (const extent of [40, 489, 4000]) assert.ok(Math.abs(extent / speedFor(extent) - 5) < 1e-9, 'five seconds to cross');
});

test('navigate: the basis is used as given, so a tilted camera flies where it looks', () => {
  const diagonal = 1 / Math.SQRT2;
  const d = step({ held: held('ArrowUp'), dt: 0.1, speed: 10, forward: [diagonal, 0, -diagonal], right: [diagonal, 0, diagonal], up: [0, 1, 0] });
  assert.ok(Math.abs(d[0] - diagonal) < 1e-9 && Math.abs(d[2] + diagonal) < 1e-9);
  assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-9);
});
