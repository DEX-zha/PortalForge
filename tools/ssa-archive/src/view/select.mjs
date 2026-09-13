// Hit ordering and selection cycling, as pure functions (feature 003 T018).
//
// Levels contain coincident placements: several cutscene markers on one spot, a prop inside a bounding box. A
// click that could only ever reach the nearest one would make those objects unselectable. So clicking again
// without moving the pointer advances through the stack under the cursor and wraps around, which is the cheapest
// interaction that guarantees reachability (research R4).

// How far the pointer may drift and still count as the same click, in pixels. Big enough for hand jitter on a
// drag-free click, small enough that a deliberate move to another object starts a new selection.
export const POINTER_TOLERANCE = 4;

export const samePointer = (a, b) =>
  !!a && !!b && Math.abs(a.x - b.x) <= POINTER_TOLERANCE && Math.abs(a.y - b.y) <= POINTER_TOLERANCE;

// Nearest first. Equal distances keep their incoming order, so the cycle is deterministic from one click to the
// next even when two proxies are exactly coincident.
export function orderHits(hits) {
  return hits.map((h, i) => ({ h, i }))
    .sort((a, b) => a.h.distance - b.h.distance || a.i - b.i)
    .map(x => x.h);
}

// The next selection for a click. `previous` is the selection this click may be continuing.
export function pickNext({ hits, pointer, previous = null }) {
  if (!hits.length) return null;                      // nothing under the cursor clears the selection
  const continuing = previous && samePointer(previous.pointer, pointer);
  const index = continuing ? (previous.index + 1) % hits.length : 0;
  const hit = hits[index];
  return { offset: hit.offset, index, pointer: { x: pointer.x, y: pointer.y }, total: hits.length };
}
