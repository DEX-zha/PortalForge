// The single place any axis convention is written (feature 003 T008, research R7).
//
// The game stores a placement position as three big-endian floats, x, y, z, with y upward: the tutorial spawn is
// (91.73, 10.31, 44.74) and every prop of that island sits within a few units of it, which fixes the vertical axis
// and the scale beyond doubt. What it does NOT fix is the handedness of the horizontal plane. A screenshot taken
// during the duplication runs suggests one horizontal axis is inverted relative to the obvious reading, and a
// suggestion from a single camera angle is not proof.
//
// So the mapping ships straight, `flipX: false`, and marked unverified. Quickstart scenario 2 settles it by
// comparing a top-down view of the tutorial with an in-game screenshot of the same island. When that check runs,
// set `verified: true`, and set `flipX: true` as well if the layout came out mirrored. Nothing else in the editor
// may hold an axis convention, so that decision is made once, here, and every spatial claim follows it.

export const HANDEDNESS = {
  flipX: false,
  verified: false,
  note: 'unverified until quickstart scenario 2 compares a top-down view of Level_027_Tutorial with an in-game screenshot',
};

// Position triples only. The mapping is an involution: applying it twice returns the original, which is what makes
// it safe to convert back and forth while dragging without accumulating error.
export function makeMapping({ flipX = false } = {}) {
  const swap = ([x, y, z]) => [flipX ? -x : x, y, z];
  return { toView: swap, toGame: swap, flipX };
}

export const mapping = makeMapping(HANDEDNESS);

// Heading is stored in degrees. The view rotates around the vertical axis; when the horizontal plane is mirrored
// the sense of rotation mirrors with it, so the heading conversion follows the same single flag.
export const headingToView = deg => (HANDEDNESS.flipX ? -deg : deg);
export const headingToGame = deg => (HANDEDNESS.flipX ? -deg : deg);

// The file stores 100 for unit scale.
export const scaleToView = value => value / 100;
export const scaleToGame = value => value * 100;
