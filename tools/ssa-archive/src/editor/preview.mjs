// A headless render of the 3D view (feature 003), so "the viewport shows nothing" is a claim that can be checked.
//
// This machine has no browser automation, and a WebGL canvas that draws one flat colour is indistinguishable from
// an empty scene by description alone. This renders the SAME level, through the SAME framing arithmetic the scene
// uses (src/view/framing.mjs), into a PNG with the project's own encoder. It is not three.js: there is no lighting,
// no depth buffer beyond painter order, and no orbiting. What it does prove is the part that was actually broken:
// which objects are in frame, where the camera ends up, and how many pixels across a proxy lands.
import fs from 'node:fs';
import { encode } from '../evidence/png.mjs';
import { mapping, scaleToView } from '../view/coords.mjs';
import {
  MARKER_RATIO, MIN_INSTANCE_SCALE, GROUND, GRID_MAJOR, GRID_MINOR, GRADE_COLOUR, MARKER_COLOUR,
  extentOf, proxySize, bulkBox, viewAxes, fitDistance, gridOf, projector, gradeOf,
} from '../view/framing.mjs';

const rgb = n => [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

export function renderPreview(session, { out, width = 1100, height = 780, layer = null } = {}) {
  const chosen = layer
    ? session.placements.filter(p => (p.layers ?? []).includes(layer))
    : session.placements;
  if (!chosen.length) throw Object.assign(new Error(layer ? `no placement is in layer ${layer}` : 'this level carries no placements'), { error: 'NOTHING_TO_DRAW' });

  const points = chosen.map(p => mapping.toView(p.position));
  const { lo, reach } = extentOf(points);
  const proxy = proxySize(reach);
  const bulk = bulkBox(points);
  const centre = [0, 1, 2].map(i => (bulk.lo[i] + bulk.hi[i]) / 2);
  const aspect = width / height;
  const distance = fitDistance(points, centre, { aspect });
  const axes = viewAxes();
  const eye = centre.map((c, i) => c + axes.z[i] * distance);
  const project = projector({ eye, w: width, h: height });

  const img = { w: width, h: height, ch: 3, data: Buffer.alloc(width * height * 3) };
  const ground = rgb(GROUND);
  for (let i = 0; i < width * height; i++) img.data.set(ground, i * 3);
  const put = (x, y, c) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    img.data.set(c, (y * width + x) * 3);
  };
  const line = (a, b, c) => {
    const p = project(a), q = project(b);
    if (!p || !q) return;
    const n = Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) | 0;
    for (let i = 0; i <= n; i++) put(p.x + (q.x - p.x) * i / n, p.y + (q.y - p.y) * i / n, c);
  };

  // The ground grid, under the lowest object, so height reads as height rather than as a position on a void.
  const { step, span } = gridOf(reach);
  const gy = lo[1] - proxy;
  const major = rgb(GRID_MAJOR), minor = rgb(GRID_MINOR);
  for (let i = 0; i <= Math.round(span / step); i++) {
    const t = -span / 2 + i * step, mid = Math.abs(t) < step / 2 ? major : minor;
    line([centre[0] + t, gy, centre[2] - span / 2], [centre[0] + t, gy, centre[2] + span / 2], mid);
    line([centre[0] - span / 2, gy, centre[2] + t], [centre[0] + span / 2, gy, centre[2] + t], mid);
  }

  // Proxies, painted far to near. A placement with no model is drawn smaller and in the marker colour, which is
  // the same distinction the scene draws as a wireframe octahedron.
  const drawn = chosen
    .map((p, i) => ({ p, screen: project(points[i]) }))
    .filter(d => d.screen)
    .sort((a, b) => b.screen.depth - a.screen.depth);
  const sizes = [];
  for (const { p, screen } of drawn) {
    const placed = !!p.model?.path;
    const world = proxy * Math.max(scaleToView(p.scale) || 1, MIN_INSTANCE_SCALE) * (placed ? 1 : MARKER_RATIO);
    const half = Math.max(world * screen.perUnit / 2, 0.5);
    sizes.push(half * 2);
    const base = placed ? rgb(GRADE_COLOUR[gradeOf(p)] ?? GRADE_COLOUR.info) : rgb(MARKER_COLOUR);
    for (let y = Math.round(screen.y - half); y <= screen.y + half; y++) {
      for (let x = Math.round(screen.x - half); x <= screen.x + half; x++) {
        // A lighter top and a darker base, so a square reads as a solid sitting on the ground rather than a sticker.
        const shade = half < 2 ? 1.12 : 0.62 + 0.5 * ((screen.y + half - y) / (half * 2));
        put(x, y, base.map(c => Math.min(255, Math.round(c * shade))));
      }
    }
  }

  if (out) encode(img, out);
  sizes.sort((a, b) => a - b);
  const onScreen = drawn.filter(d => d.screen.x >= 0 && d.screen.x < width && d.screen.y >= 0 && d.screen.y < height);
  return {
    file: out ?? null,
    width, height,
    image: img,
    placements: chosen.length,
    drawn: drawn.length,
    on_screen: onScreen.length,
    extent: Math.round(reach),
    proxy_units: Math.round(proxy * 100) / 100,
    proxy_px_median: sizes.length ? Math.round(sizes[Math.floor(sizes.length / 2)] * 10) / 10 : 0,
    proxy_px_min: sizes.length ? Math.round(sizes[0] * 10) / 10 : 0,
    proxy_px_max: sizes.length ? Math.round(sizes[sizes.length - 1] * 10) / 10 : 0,
    camera: eye.map(v => Math.round(v)),
    target: centre.map(v => Math.round(v)),
    distance: Math.round(distance),
    grid: { step, span },
  };
}

// The number a person actually wants: is a proxy big enough to see and click, and did the framing keep the level
// inside the picture. Below about six pixels the view reads as empty even though every object is drawn.
export const LEGIBLE_PX = 6;

export function formatPreview(r) {
  const pct = r.drawn ? Math.round(r.on_screen / r.drawn * 100) : 0;
  return [
    `${r.placements} placements, ${r.drawn} in front of the camera, ${pct}% inside the picture`,
    `extent ${r.extent} units, proxy ${r.proxy_units} units`,
    `proxy on screen: ${r.proxy_px_median} px median, ${r.proxy_px_min} to ${r.proxy_px_max}`
      + (r.proxy_px_median < LEGIBLE_PX ? '  <-- below the legible floor, the view will look empty' : ''),
    `camera ${r.camera.join(', ')} at ${r.distance} units, looking at ${r.target.join(', ')}`,
    `grid ${r.grid.step} unit squares over ${r.grid.span} units`,
    r.file ? `written ${r.file}` : 'not written',
  ].join(String.fromCharCode(10));
}

export function previewToFile(session, opts) {
  const r = renderPreview(session, opts);
  if (opts?.out && !fs.existsSync(opts.out)) throw new Error(`preview could not be written to ${opts.out}`);
  return r;
}
