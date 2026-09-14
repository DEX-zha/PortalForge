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

// Whether a pointerdown on the canvas is a pick at all. The transform gizmo listens on the same canvas and gets
// the event first, so by the time the pick handler runs a grab of a gizmo handle already shows as `dragging` with
// an `axis` under the pointer. Treating that grab as a click re-selected whatever proxy sat under the handle and
// teleported the outline to it, and the drag then committed the outline's position to THAT object. From the
// outside: "I moved A and B jumped", four different objects sharing one x,z. Only the primary button, with the
// gizmo idle, is a pick.
export function shouldPick({ button = 0, gizmoAxis = null, gizmoDragging = false } = {}) {
  return button === 0 && gizmoAxis === null && !gizmoDragging;
}

// Which object a gizmo drag edits: the one the drag STARTED on, never the current selection. The two are the same
// in every healthy interaction, and when they differ the current selection is the bug, not the target.
export function commitTarget(dragStart, selection) {
  if (dragStart && Number.isInteger(dragStart.offset)) return dragStart.offset;
  return selection ? selection.offset : null;
}
