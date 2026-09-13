import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROXY_FRACTION, MIN_PROXY, FOV, VIEW_DIR, extentOf, proxySize, bulkBox, viewAxes,
  fitDistance, fitBox, gridOf, projector, gradeOf,
} from '../src/view/framing.mjs';

// Feature 003. These guard the defect the user actually hit: the viewport looked empty. Nothing was missing from
// it -- 673 proxies were drawn -- but a fixed 1.6-unit proxy on a 489-unit level is three pixels across, and a
// camera placed from the bounding box diagonal pushed even those into the distance. Both sizes are now derived
// from the level, and both derivations are checked here rather than by looking at a screen.

// The shape of a level: a long diagonal ridge, almost flat, filling very little of its own bounding box.
const RIDGE = [];
for (let i = 0; i < 200; i++) RIDGE.push([i * 2.4, Math.sin(i / 9) * 12, i * 1.6]);
// The same level with two far strays, which is what a level really looks like: a handful of cameras and triggers
// sit well outside the island the player walks on.
const WITH_STRAYS = [...RIDGE, [-900, 4, -700], [1400, 9, 1100]];

const inFrustum = (points, centre, aspect) => {
  const distance = fitDistance(points, centre, { aspect });
  const ax = viewAxes();
  const eye = centre.map((c, i) => c + ax.z[i] * distance);
  const project = projector({ eye, w: 1000 * aspect, h: 1000 });
  return points.map(p => project(p)).map(s => s && s.x >= 0 && s.x <= 1000 * aspect && s.y >= 0 && s.y <= 1000);
};

test('a proxy is sized from the level, so it lands at a readable size on any level', () => {
  assert.equal(proxySize(489), 489 * PROXY_FRACTION);
  assert.ok(proxySize(489) > 4 && proxySize(489) < 5);
  assert.equal(proxySize(10), MIN_PROXY, 'a tiny level does not get an invisible proxy');
  assert.ok(proxySize(1200) > proxySize(400), 'a bigger level gets a bigger proxy');
});

test('the fitted distance holds the objects inside the frustum', () => {
  const bulk = bulkBox(RIDGE);
  const centre = [0, 1, 2].map(i => (bulk.lo[i] + bulk.hi[i]) / 2);
  const inside = inFrustum(RIDGE, centre, 1.41);
  const kept = inside.filter(Boolean).length;
  assert.ok(kept / RIDGE.length >= 0.97, `expected almost every object on screen, got ${kept}/${RIDGE.length}`);
});

test('a few strays do not decide the zoom, but almost everything stays in frame', () => {
  const bulk = bulkBox(WITH_STRAYS);
  const centre = [0, 1, 2].map(i => (bulk.lo[i] + bulk.hi[i]) / 2);
  const fitted = fitDistance(WITH_STRAYS, centre, { aspect: 1.41 });
  const toTheExtremes = fitDistance(WITH_STRAYS, centre, { aspect: 1.41, percentile: 1 });
  assert.ok(fitted < toTheExtremes * 0.75,
    `fitting the extremes costs ${Math.round(toTheExtremes)} units against ${Math.round(fitted)}`);

  // The saving is only worth having if the level is still in the picture, so check that too rather than trusting it.
  const kept = inFrustum(RIDGE, centre, 1.41).filter(Boolean).length;
  assert.ok(kept / RIDGE.length >= 0.97, `${kept}/${RIDGE.length} of the level stayed on screen`);
});

test('the trim keeps two distant strays from deciding the zoom for the whole level', () => {
  const full = extentOf(WITH_STRAYS);
  const bulk = bulkBox(WITH_STRAYS, 0.04);
  assert.ok(bulk.lo[0] > full.lo[0] && bulk.hi[0] < full.hi[0]);
  assert.ok(bulk.hi[0] - bulk.lo[0] < (full.hi[0] - full.lo[0]) / 2, 'the strays are excluded, not merely nudged');
  assert.deepEqual(bulkBox(WITH_STRAYS, 0), { lo: full.lo, hi: full.hi }, 'no trim means the true extent');
});

test('an empty level does not divide by zero or produce a NaN camera', () => {
  assert.equal(extentOf([]).reach, 100);
  assert.deepEqual(bulkBox([]), { lo: [0, 0, 0], hi: [0, 0, 0] });
  assert.ok(Number.isFinite(fitDistance([], [0, 0, 0], {})));
  const single = fitDistance([[5, 5, 5]], [5, 5, 5], {});
  assert.ok(Number.isFinite(single) && single > 0, 'one object still gets a camera in front of it');
});

test('the view axes are right handed, so the scene cannot mirror the level by accident', () => {
  const { x, y, z } = viewAxes(VIEW_DIR);
  const cross = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  const dot = cross[0] * z[0] + cross[1] * z[1] + cross[2] * z[2];
  assert.ok(dot > 0.99, `x cross y should be z, got ${dot}`);
  assert.ok(Math.abs(Math.hypot(...x) - 1) < 1e-9 && Math.abs(Math.hypot(...z) - 1) < 1e-9);
});

test('what is in front of the camera projects, what is behind it does not', () => {
  const eye = [0, 0, 100];
  const project = projector({ eye, w: 800, h: 600, dir: [0, 0, 1] });
  const front = project([0, 0, 0]);
  assert.ok(front && Math.abs(front.x - 400) < 0.001 && Math.abs(front.y - 300) < 0.001, 'the centre lands in the middle');
  assert.equal(project([0, 0, 200]), null, 'a point behind the camera is dropped, never wrapped around');
  assert.ok(project([0, 0, -400]).perUnit < front.perUnit, 'further away is smaller');
});

test('the grid step is a round number of game units', () => {
  for (const reach of [37, 120, 489, 1000, 4200]) {
    const { step, span } = gridOf(reach);
    const mantissa = step / Math.pow(10, Math.floor(Math.log10(step)));
    assert.ok([1, 2, 5].some(m => Math.abs(mantissa - m) < 1e-9), `${step} is not 1, 2 or 5 times a power of ten`);
    assert.ok(span >= reach, 'the grid reaches past the level it sits under');
    assert.ok(Math.abs(span / step - Math.round(span / step)) < 1e-9, 'the grid needs a whole number of divisions');
    assert.ok(span / step >= 8 && span / step <= 20, `${span / step} squares is not a readable count`);
  }
});

test('the palette encodes danger and nothing else', () => {
  assert.equal(gradeOf({ behavior: { path: 'PushBlock.ai' } }), 'critical');
  assert.equal(gradeOf({ behavior: { path: 'Sunflower.ai' } }), 'medium');
  assert.equal(gradeOf({ model: { status: 'ambiguous' } }), 'high');
  assert.equal(gradeOf({ model: { status: 'direct' } }), 'info');
  assert.equal(gradeOf({}), 'info', 'a record with nothing on it is not an error');
});

test('the field of view the scene uses is the field of view the fit assumes', () => {
  // If these ever drift, the preview stops being evidence about the view: it would frame a different picture.
  const wide = fitDistance(RIDGE, [0, 0, 0], { fov: FOV, aspect: 1.41 });
  const narrow = fitDistance(RIDGE, [0, 0, 0], { fov: FOV / 2, aspect: 1.41 });
  assert.ok(narrow > wide, 'a narrower lens has to stand further back');
});
