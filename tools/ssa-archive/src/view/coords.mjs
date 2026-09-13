// The single place any axis convention is written (feature 003 T008, research R7).
//
// The game stores a placement position as three big-endian floats, x, y, z, with y upward: the tutorial spawn is
// (91.73, 10.31, 44.74) and every prop of that island sits within a few units of it, which fixes the vertical axis
// and the scale beyond doubt. What it does NOT fix is the handedness of the horizontal plane. A screenshot taken
// during the duplication runs suggests one horizontal axis is inverted relative to the obvious reading, and a
// suggestion from a single camera angle is not proof.
//
// SETTLED (T024), and by derivation rather than by looking at a render. Four judged in-game runs fix it:
//   - the spawn x moved +8 and the Skylander appeared screen-LEFT (m2-…-o1734528-1789248814839, 2 runs);
//   - Windmill_Blades2 x moved 85.52 -> 79.5 and the blades appeared screen-RIGHT (m2-…-o3296360, 2 runs);
//   - a sunflower copied to x 85.5 appeared left of the originals at 82.25 and 79.68 (m3-…-1789304493862, 2 runs);
//   - sunflower(2) moved x 79.68 -> 88 and z 40.94 -> 44 and appeared further left and nearer the windmill, which
//     sits at z 50.33, so +z is away from the camera (m3-…-1789304824550).
// The last one fixes the view direction as +z; the first three fix screen-right as -x. For a camera with forward
// f and up u, screen-right is f x u, which is (-1,0,0) in a right-handed system and (+1,0,0) in a left-handed one.
// The game shows -x, so the game is right-handed with y up, exactly like three.js, and the identity mapping
// preserves chirality. No mirror. tests/view-coords-handedness.test.mjs encodes the derivation so that flipping
// the flag cannot pass unnoticed.
//
// Nothing else in the editor may hold an axis convention: that decision is made once, here.

export const HANDEDNESS = {
  flipX: false,
  verified: true,
  note: 'right-handed, y up, same as three.js: derived from m2-…-o1734528-1789248814839, m2-…-o3296360-1789305999607, m3-…-1789304493862 and m3-…-1789304824550',
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
