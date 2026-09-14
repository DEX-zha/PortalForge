// Free flight through the viewport (feature 004), as pure arithmetic: given which keys are held, how long the
// frame lasted and the camera's own axes, it says how far to move. The scene applies the result to the camera
// and to its orbit target together, so orbiting continues from wherever the flight stopped.
//
// This exists because a level contains models big enough to swallow the camera -- a cloud layer, a landmass, a
// water dome -- and once inside one, orbiting around a target that is also inside it cannot get out. Flying
// does, and the wireframe toggle makes the inside of a mesh readable while it happens.

// Arrows move, because that is what a hand reaches for first. w, e and r are the gizmo modes and stay so.
export const BINDINGS = {
  ArrowUp: 'forward', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right',
  PageUp: 'up', PageDown: 'down',
};
export const isBound = key => Object.prototype.hasOwnProperty.call(BINDINGS, key);

// Speed comes from the level's own size: a fifth of its extent per second crosses it in five seconds, on a
// 40-unit level and a 4000-unit one alike. Shift hurries, Alt creeps.
export const BASE_SPEED = 1 / 5;
export const FAST = 4;
export const SLOW = 0.25;
export const speedFor = (extent, { fast = false, slow = false } = {}) =>
  Math.max(extent, 1) * BASE_SPEED * (fast ? FAST : 1) * (slow ? SLOW : 1);

// A tab that was in the background hands back one enormous frame; without this the first key press after it
// would teleport the camera across the level.
export const MAX_DT = 0.1;

export function step({ held = new Set(), dt = 0, speed = 0, forward = [0, 0, -1], right = [1, 0, 0], up = [0, 1, 0] } = {}) {
  const move = [0, 0, 0];
  const add = (v, s) => { move[0] += v[0] * s; move[1] += v[1] * s; move[2] += v[2] * s; };
  for (const key of held) {
    switch (BINDINGS[key]) {
      case 'forward': add(forward, 1); break;
      case 'back': add(forward, -1); break;
      case 'right': add(right, 1); break;
      case 'left': add(right, -1); break;
      case 'up': add(up, 1); break;
      case 'down': add(up, -1); break;
      default: break;
    }
  }
  const length = Math.hypot(...move);
  if (!length || !(dt > 0) || !(speed > 0)) return [0, 0, 0];
  // Normalised, so holding two arrows at once is not faster than holding one.
  const k = speed * Math.min(dt, MAX_DT) / length;
  return [move[0] * k, move[1] * k, move[2] * k];
}
