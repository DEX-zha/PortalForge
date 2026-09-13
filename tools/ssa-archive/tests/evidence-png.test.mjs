import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decode, encode, crop, diffBoxes } from '../src/evidence/png.mjs';

const img = (w, h, fill) => { const data = Buffer.alloc(w * h * 3); for (let i = 0; i < w * h; i++) { data[i * 3] = fill[0]; data[i * 3 + 1] = fill[1]; data[i * 3 + 2] = fill[2]; } return { w, h, ch: 3, data }; };

test('png: encode then decode round-trips pixels, crop zooms, diffBoxes finds the changed region', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-png-'));
  const a = img(40, 30, [10, 200, 30]);
  const b = img(40, 30, [10, 200, 30]);
  for (let y = 12; y < 20; y++) for (let x = 5; x < 15; x++) { const i = (y * 40 + x) * 3; b.data[i] = 240; b.data[i + 1] = 20; b.data[i + 2] = 20; }   // a red patch
  const fa = encode(a, path.join(dir, 'a.png')), fb = encode(b, path.join(dir, 'b.png'));
  const da = decode(fa), db = decode(fb);
  assert.equal(da.w, 40); assert.equal(da.h, 30); assert.equal(da.ch, 3);
  assert.ok(da.data.equals(a.data), 'round-trip must preserve pixels');
  assert.ok(db.data.equals(b.data));
  const boxes = diffBoxes(da, db, 45, 10);
  assert.equal(boxes.length, 1);
  assert.deepEqual([boxes[0].x, boxes[0].y, boxes[0].w, boxes[0].h], [5, 12, 10, 8]);
  assert.equal(boxes[0].pixels, 80);
  assert.deepEqual(diffBoxes(da, da, 45, 10), []);                       // identical images differ nowhere
  const z = crop(db, 5, 12, 10, 8, 3);
  assert.equal(z.w, 30); assert.equal(z.h, 24);
  assert.equal(z.data[0], 240); assert.equal(z.data[1], 20);             // the zoomed crop starts on the patch
  const clipped = crop(db, 35, 25, 20, 20, 1);                          // a region running off the edge is clipped
  assert.equal(clipped.w, 5); assert.equal(clipped.h, 5);
  assert.throws(() => diffBoxes(da, crop(db, 0, 0, 10, 10, 1)), /size mismatch/);
});
