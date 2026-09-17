// How the viewport is sized, framed and coloured (feature 003 T019, T020), as plain arithmetic on number triples.
//
// This module exists because the same decisions are made twice: once by scene.mjs inside a browser with three.js,
// and once by `edit preview`, which rasterises the same level to a PNG on a machine with no browser at all. Kept
// in two places they would drift, and the preview would stop being evidence about the view. Kept here they cannot:
// there is one definition of a proxy's size, one of where the camera goes, and one of what each colour means.
//
// Nothing here imports three, so it is unit tested directly.

// A placement record carries no bounds, so any proxy size is chosen rather than measured. Choose it for reading:
// one part in 110 of the level's own extent puts a proxy at roughly ten to fifteen pixels when the whole level is
// framed, on every level, instead of the three pixels a fixed 1.6 units gave on a 489-unit island.
export const PROXY_FRACTION = 1 / 110;
export const MIN_PROXY = 1.0;
export const MARKER_RATIO = 0.55; // a placement with no model is drawn smaller, and hollow
export const MIN_INSTANCE_SCALE = 0.25; // the record's own scale, floored so a tiny prop never vanishes

export const FOV = 55; // degrees, vertical
export const VIEW_DIR = [1, 0.8, 1]; // the camera sits along this direction from what it is looking at
const MARGIN = 1.06;
export const TRIM = 0.04; // frame the middle 92% on each axis
const FIT_PERCENTILE = 0.98;

// A survey drawing of a dig, not an editor theme: deep ink ground, bone objects, and colour spent only where it
// encodes something the researcher has to respect, which here is how dangerous an object is to touch.
export const GROUND = 0x0f1319;
export const GRID_MAJOR = 0x27323e;
export const GRID_MINOR = 0x1a222b;
export const GRADE_COLOUR = {
  blocking: 0xd2553f, // observed to break the game
  critical: 0xd2553f,
  high: 0xd98f3d, // the model resolves more than one way
  medium: 0xd9a441, // carries a behaviour script
  info: 0xe8e2d4, // bone: a plain placed object
};
export const MARKER_COLOUR = 0x5d6b7a; // camera, cutscene, sound: present, not placed
export const SELECTED_COLOUR = 0x7fd4ff;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

// The full span of the points, and the longest axis of it, which is what every size in the view is derived from.
export function extentOf(points) {
  if (!points.length) return { lo: [0, 0, 0], hi: [0, 0, 0], reach: 100 };
  const lo = [0, 1, 2].map(i => Math.min(...points.map(p => p[i])));
  const hi = [0, 1, 2].map(i => Math.max(...points.map(p => p[i])));
  return { lo, hi, reach: Math.max(...[0, 1, 2].map(i => hi[i] - lo[i])) || 100 };
}

export const proxySize = reach => Math.max(reach * PROXY_FRACTION, MIN_PROXY);

// Some levels park objects out of the way: six boss levels keep BossCamera, PhaseDirector and EvilPortalMaster
// at (30480, 30480, 30480), and a shared set of switch templates sits near (30, 0, -815) whatever the level
// around it. They are real records, selectable and editable, but sizing the proxies, the grid and the framing
// from them made Haunted Castle a 31 000-unit level with 284-unit boxes. A placement is parked when it lies more
// than PARKED_GAPS level-widths outside the bulk box; distant islands and power gems sit under two widths on
// every level measured, and the tutorial parks nothing, so its view is unchanged.
export const PARKED_GAPS = 3;
export function levelExtent(points, { trim = TRIM, gaps = PARKED_GAPS } = {}) {
  if (!points.length) return { ...extentOf(points), parked: [] };
  const bulk = bulkBox(points, trim);
  const span = Math.max(...[0, 1, 2].map(i => bulk.hi[i] - bulk.lo[i])) || 1;
  const parked = [],
    kept = [];
  points.forEach((p, i) => {
    const gap = Math.max(...[0, 1, 2].map(a => Math.max(0, bulk.lo[a] - p[a], p[a] - bulk.hi[a])));
    if (gap > gaps * span) parked.push(i);
    else kept.push(p);
  });
  return { ...extentOf(kept), parked };
}

// The middle 1-2*trim of the objects on each axis. Framing the true extremes lets a handful of distant markers
// decide the zoom for the whole level, which is how 673 proxies once ended up three pixels wide.
export function bulkBox(points, trim = TRIM) {
  if (!points.length) return { lo: [0, 0, 0], hi: [0, 0, 0] };
  const axes = [0, 1, 2].map(i => points.map(p => p[i]).sort((a, b) => a - b));
  return {
    lo: axes.map(a => a[Math.floor((a.length - 1) * trim)]),
    hi: axes.map(a => a[Math.ceil((a.length - 1) * (1 - trim))]),
  };
}

// The camera's own axes for the fixed view direction: z points back towards the camera, x is screen right and
// y is screen up.
export function viewAxes(dir = VIEW_DIR) {
  const z = norm(dir);
  const x = norm(cross([0, 1, 0], z));
  return { x, y: cross(z, x), z };
}

// How far back the camera has to sit for a point to be on screen: with depth = distance - z, the point is inside
// the frustum when |y| <= tan*depth and |x| <= tan*aspect*depth.
function need(d, ax, tan, aspect) {
  return Math.max(dot(d, ax.z) + Math.abs(dot(d, ax.y)) / tan, dot(d, ax.z) + Math.abs(dot(d, ax.x)) / (tan * aspect));
}

// Fit the OBJECTS, not the box that contains them. A level is a diagonal ridge inside a wide axis-aligned box
// whose corners hold nothing, so fitting the corners pushes the camera back to make room for empty space. The
// percentile keeps one stray marker from doing the same.
export function fitDistance(
  points,
  centre,
  { fov = FOV, aspect = 1.6, dir = VIEW_DIR, margin = MARGIN, percentile = FIT_PERCENTILE, floor = 5 } = {},
) {
  const ax = viewAxes(dir),
    tan = Math.tan((fov * Math.PI) / 360);
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1.6;
  if (!points.length) return floor;
  const needed = points.map(p => need(sub(p, centre), ax, tan, a)).sort((x, y) => x - y);
  const d = needed[Math.min(needed.length - 1, Math.floor(needed.length * percentile))];
  return Math.max(d * margin, floor);
}

// The same fit for a box with no objects to fit, which is what framing a single selection is.
export function fitBox(lo, hi, centre, opts = {}) {
  const corners = [];
  for (const x of [lo[0], hi[0]])
    for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) corners.push([x, y, z]);
  return fitDistance(corners, centre, { ...opts, percentile: 1 });
}

// A ground grid that belongs to this level, so an object's height reads as height rather than as a position on a
// void. The step is 1, 2 or 5 times a power of ten -- the sequence a surveyor's scale bar uses -- which keeps the
// squares a round number of game units AND keeps their count near a dozen on a 40-unit level and a 4000-unit one
// alike. A bare power of ten does the first but not the second: it swings from 13 squares to 130 across a decade.
export function gridOf(reach) {
  const span = reach * 1.4;
  const raw = span / 14;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = ([1, 2, 5, 10].find(m => raw <= m * power * (1 + 1e-9)) ?? 10) * power;
  return { step, span: Math.ceil(span / step) * step };
}

// Where a world point lands on a w by h image, and how many pixels one world unit covers there.
export function projector({ eye, w, h, fov = FOV, dir = VIEW_DIR }) {
  const ax = viewAxes(dir),
    tan = Math.tan((fov * Math.PI) / 360),
    aspect = w / h;
  return p => {
    const d = sub(p, eye),
      depth = -dot(d, ax.z); // z points back at the camera, so what is in front has +depth
    if (depth <= 0.01) return null;
    return {
      x: ((dot(d, ax.x) / (tan * aspect * depth) + 1) / 2) * w,
      y: ((1 - dot(d, ax.y) / (tan * depth)) / 2) * h,
      depth,
      perUnit: h / 2 / (tan * depth),
    };
  };
}

// How dangerous an object is to touch, which is the only thing the palette encodes. It lives here because both the
// browser view and the headless preview colour by it, and a proxy that is amber in one and bone in the other would
// make the preview useless as evidence about the view.
//
// PushBlock is singled out because a pushable block is bound to a track it does not carry (finding
// level.pushblock.track-dependency): moving one is the single change most likely to break a level quietly.
export function gradeOf(p) {
  if (p.behavior && /PushBlock/i.test(p.behavior.path ?? '')) return 'critical';
  if (p.model?.status === 'ambiguous') return 'high';
  if (p.behavior) return 'medium';
  return 'info';
}
// Broad surfaces (sky domes, water effects, etc.) otherwise hide the editing area without their materials.
// This is a reversible preview treatment by measured size, never a semantic terrain classification.
export const largeSurfaceLimit = reach => Math.max(32, reach / 2);
