import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from '../src/evidence/png.mjs';
import { openSession } from '../src/editor/session.mjs';
import { renderPreview, LEGIBLE_PX } from '../src/editor/preview.mjs';
import { syntheticLevel } from './helpers/synthetic-level.mjs';

// Feature 003. The viewport once looked empty while drawing 673 proxies, and nothing in the test suite could tell
// the difference: there is no browser on this machine, and a WebGL canvas that draws one flat colour is not
// distinguishable from an empty scene by description. These tests render the same level through the same framing
// arithmetic and then COUNT the pixels, so "the view shows nothing" becomes a number instead of an impression.

const here = path.dirname(fileURLToPath(import.meta.url));
const TUTORIAL = path.resolve(here, '../../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded');
const MINING = path.resolve(here, '../../../.local/workspaces/mining-bld/entries/3-level.bld.decoded');
const haveSamples = fs.existsSync(TUTORIAL) && fs.existsSync(MINING);
const gates = { gates: () => ({ status: 'PASS' }) };
const open = file => openSession(file, { archive: 'level/x.bld', entry: 3, deps: gates });
const tmp = name => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-prev-')), name);

// The share of pixels that are not the background. Below a fraction of a percent the picture reads as empty
// whatever the proxy count says.
function inkFraction(img) {
  let ink = 0;
  for (let i = 0; i < img.w * img.h; i++) {
    const p = i * img.ch;
    if (img.data[p] !== 0x0f || img.data[p + 1] !== 0x13 || img.data[p + 2] !== 0x19) ink++;
  }
  return ink / (img.w * img.h);
}

test('the render puts ink on the page, which is what "the canvas shows nothing" was about', () => {
  const s = open(syntheticLevelFile());
  const r = renderPreview(s, { out: null, width: 400, height: 300 });
  assert.ok(r.drawn > 0, 'nothing was drawn at all');
  assert.ok(
    inkFraction(r.image) > 0.001,
    `only ${(inkFraction(r.image) * 100).toFixed(3)}% of the picture is not background`,
  );
});

test(
  'a proxy is big enough to see and to click on a real level',
  { skip: !haveSamples && 'local samples absent' },
  () => {
    for (const file of [TUTORIAL, MINING]) {
      const r = renderPreview(open(file), { out: null, width: 1100, height: 780 });
      assert.ok(
        r.proxy_px_median >= LEGIBLE_PX,
        `${path.basename(file)}: ${r.proxy_px_median}px median is below the ${LEGIBLE_PX}px floor`,
      );
      assert.ok(
        r.on_screen / r.drawn >= 0.95,
        `${path.basename(file)}: only ${Math.round((r.on_screen / r.drawn) * 100)}% of the level is inside the picture`,
      );
      assert.ok(inkFraction(r.image) > 0.004, `${path.basename(file)}: the picture is nearly all background`);
    }
  },
);

test(
  'the fixed 1.6-unit proxy that caused the bug would fail this suite',
  { skip: !haveSamples && 'local samples absent' },
  () => {
    // The regression, stated as arithmetic rather than as a memory. A 489-unit level framed on a 1100x780 canvas
    // put a 1.6-unit cube at about three pixels; the size is now derived from the level and lands near twelve.
    const r = renderPreview(open(TUTORIAL), { out: null, width: 1100, height: 780 });
    const oldPx = r.proxy_px_median * (1.6 / r.proxy_units);
    assert.ok(
      oldPx < LEGIBLE_PX,
      `the old fixed size would have been ${oldPx.toFixed(1)}px, which should be illegible`,
    );
    assert.ok(r.proxy_px_median > oldPx * 2, 'the derived size is not meaningfully bigger than the fixed one');
  },
);

test(
  'every level gets a proxy of its own size, so nothing is tuned to the tutorial',
  { skip: !haveSamples && 'local samples absent' },
  () => {
    const a = renderPreview(open(TUTORIAL), { out: null, width: 800, height: 600 });
    const b = renderPreview(open(MINING), { out: null, width: 800, height: 600 });
    assert.notEqual(a.extent, b.extent, 'the two levels are not the same size');
    assert.notEqual(a.proxy_units, b.proxy_units, 'so their proxies should not be either');
    assert.ok(
      Math.abs(a.proxy_px_median - b.proxy_px_median) < a.proxy_px_median,
      'yet both should land in the same readable range on screen',
    );
  },
);

test('the file it writes is a PNG that decodes back to the picture it rendered', () => {
  const out = tmp('preview.png');
  const r = renderPreview(open(syntheticLevelFile()), { out, width: 320, height: 240 });
  assert.equal(r.file, out);
  const back = decode(out);
  assert.equal(back.w, 320);
  assert.equal(back.h, 240);
  assert.ok(back.data.equals(r.image.data), 'the written file differs from what was drawn');
});

test('a layer with nothing in it is refused by name, not rendered as an empty picture', () => {
  const s = open(syntheticLevelFile());
  assert.throws(
    () => renderPreview(s, { out: null, layer: 'NoSuchLayer' }),
    e => e.error === 'NOTHING_TO_DRAW',
  );
});

test(
  'mesh preview includes world scenery without adding fake editable placements',
  { skip: !haveSamples && 'local samples absent' },
  () => {
    const s = open(TUTORIAL),
      original = Buffer.from(s.buffer);
    const opts = { meshes: true, width: 320, height: 240, eye: [96, 18, 20], target: [86, 13, 46] };
    const props = renderPreview(s, { ...opts, scenery: false });
    const world = renderPreview(s, opts);
    assert.equal(world.scenery_units, 1584);
    assert.equal(props.scenery_units, 0);
    assert.equal(world.placements, props.placements);
    assert.equal(world.meshed, props.meshed);
    assert.deepEqual(world.camera, props.camera);
    assert.ok(!world.image.data.equals(props.image.data), 'terrain must change the actual image');
    assert.deepEqual(s.buffer, original);
  },
);

test(
  'the camera ends up in front of the level, never inside it or behind it',
  { skip: !haveSamples && 'local samples absent' },
  () => {
    const r = renderPreview(open(TUTORIAL), { out: null, width: 1100, height: 780 });
    assert.ok(r.distance > r.extent * 0.3, 'the camera is too close to see the level');
    assert.ok(r.distance < r.extent * 3, 'the camera is further away than the level is wide, three times over');
    assert.equal(r.drawn, r.placements, 'every placement is in front of the camera');
  },
);

let cached = null;
function syntheticLevelFile() {
  if (cached) return cached;
  cached = tmp('level.decoded');
  fs.writeFileSync(cached, syntheticLevel().buf);
  return cached;
}
