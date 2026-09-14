import test from 'node:test';
import assert from 'node:assert/strict';
import { orderHits, pickNext, samePointer } from '../src/view/select.mjs';

// Feature 003 T013. Levels contain coincident placements, so a click must be able to reach the object behind the
// one in front. Cycling is a pure function of the hit list and the pointer position (research R4).

const hit = (offset, distance) => ({ offset, distance });

test('select: hits are ordered by distance, nearest first, and ties keep a stable order', () => {
  const ordered = orderHits([hit(3, 9.5), hit(1, 2.0), hit(2, 2.0), hit(4, 0.5)]);
  assert.deepEqual(ordered.map(h => h.offset), [4, 1, 2, 3]);
});

test('select: the first click takes the nearest hit', () => {
  const hits = orderHits([hit(7, 4), hit(8, 1)]);
  const r = pickNext({ hits, pointer: { x: 10, y: 10 }, previous: null });
  assert.equal(r.offset, 8);
  assert.equal(r.index, 0);
});

test('select: clicking again at the same point advances through the stack and wraps', () => {
  const hits = orderHits([hit(1, 1), hit(2, 2), hit(3, 3)]);
  const pointer = { x: 40, y: 40 };
  let r = pickNext({ hits, pointer, previous: null });
  assert.equal(r.offset, 1);
  r = pickNext({ hits, pointer, previous: r });
  assert.equal(r.offset, 2);
  r = pickNext({ hits, pointer, previous: r });
  assert.equal(r.offset, 3);
  r = pickNext({ hits, pointer, previous: r });
  assert.equal(r.offset, 1, 'wraps back to the nearest');
});

test('select: moving the pointer resets the cycle to the nearest hit', () => {
  const hits = orderHits([hit(1, 1), hit(2, 2)]);
  let r = pickNext({ hits, pointer: { x: 5, y: 5 }, previous: null });
  r = pickNext({ hits, pointer: { x: 5, y: 5 }, previous: r });
  assert.equal(r.offset, 2);
  const moved = pickNext({ hits, pointer: { x: 60, y: 5 }, previous: r });
  assert.equal(moved.offset, 1, 'a different pointer position is a new selection, not a continuation');
  assert.equal(samePointer({ x: 5, y: 5 }, { x: 7, y: 6 }), true, 'a couple of pixels of jitter is still the same click');
  assert.equal(samePointer({ x: 5, y: 5 }, { x: 60, y: 5 }), false);
});

test('select: an empty hit list clears the selection rather than keeping a stale one', () => {
  const previous = { offset: 3, index: 0, pointer: { x: 1, y: 1 } };
  assert.equal(pickNext({ hits: [], pointer: { x: 1, y: 1 }, previous }), null);
});

// A grab of a gizmo handle is not a click on the level, and a drag edits the object it started on.
import { shouldPick, commitTarget } from '../src/view/select.mjs';

test('select: grabbing a gizmo handle is not a pick, so a drag can never re-select what it is dragging over', () => {
  assert.equal(shouldPick({ button: 0 }), true);
  assert.equal(shouldPick({ button: 0, gizmoAxis: 'Y' }), false, 'the pointer is on a handle');
  assert.equal(shouldPick({ button: 0, gizmoDragging: true }), false, 'a drag is under way');
  assert.equal(shouldPick({ button: 2 }), false, 'right button pans the camera');
  assert.equal(shouldPick({}), true, 'defaults describe an idle gizmo and the primary button');
});

test('select: a drag commits to the object it started on, even if the selection changed underneath it', () => {
  assert.equal(commitTarget({ offset: 0x3495e4 }, { offset: 0x34aa7c }), 0x3495e4);
  assert.equal(commitTarget(null, { offset: 0x34aa7c }), 0x34aa7c, 'with no drag start the selection stands');
  assert.equal(commitTarget({}, null), null);
});
