import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syntheticLevel } from './helpers/synthetic-level.mjs';
import { openSession } from '../src/editor/session.mjs';
import { startServer } from '../src/editor/server.mjs';
import { modelMeshes, meshesPayload } from '../src/editor/meshes.mjs';

// Feature 004. The editor draws real geometry where the decoder reaches it and a proxy where it does not, and
// the API hands the view one vertex array and one index array per model. These tests pin that contract on the
// tutorial and check that a level with no geometry sections still opens.

const here = path.dirname(fileURLToPath(import.meta.url));
const TUTORIAL = path.resolve(here, '../../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded');
const FIXUPS = path.resolve(here, '../../../.local/dolphin-evidence/ptr-scan3-fixups.json');
const have = fs.existsSync(TUTORIAL) && fs.existsSync(FIXUPS);
const skip = !have && 'local samples absent';
const gates = { gates: () => ({ status: 'PASS' }) };

let cached = null;
const tutorial = () => cached ??= openSession(TUTORIAL, { archive: 'level/Level_027_Tutorial.bld', entry: 3, fixups: JSON.parse(fs.readFileSync(FIXUPS, 'utf8')), deps: gates });

test('meshes: every model the tutorial places gets one vertex array and one index array, and they agree', { skip }, () => {
  const { models, stats } = modelMeshes(tutorial());
  assert.equal(stats.models, 210);
  assert.equal(stats.with_mesh, 210);
  assert.equal(stats.complete, true);
  assert.equal(stats.draw_units, 2264);
  for (const m of models.values()) {
    assert.equal(m.positions.length, m.vertex_count * 3);
    assert.equal(m.indices.length, m.triangle_count * 3);
    let max = -1; for (const i of m.indices) if (i > max) max = i;
    assert.ok(max < m.vertex_count, `${m.path} indexes vertex ${max} of ${m.vertex_count}`);
    assert.ok(m.units >= 1);
    assert.ok(m.fractions.every(f => f >= 6 && f <= 10));
  }
});

test('meshes: the result is computed once and cached on the session', { skip }, () => {
  const s = tutorial();
  const a = modelMeshes(s), b = modelMeshes(s);
  assert.equal(a, b);
});

test('meshes: the sunflower arrives as 736 vertices in local space, inside its declared bounds', { skip }, () => {
  const { models } = modelMeshes(tutorial());
  const sun = [...models.values()].find(m => m.path.endsWith('plant_sunflower_whole.mdl'));
  assert.equal(sun.vertex_count, 736);
  assert.equal(sun.units, 7);
  const bb = sun.bounds; assert.ok(bb);
  for (let i = 0; i < sun.vertex_count; i++) for (let k = 0; k < 3; k++) { const x = sun.positions[3 * i + k]; assert.ok(x >= bb.min[k] - 0.4 && x <= bb.max[k] + 0.4); }
  assert.ok(sun.positions.some((v, i) => i % 3 === 1 && v > 5), 'a sunflower is taller than five units');
});

test('meshes: the wire form is base64 of the native bytes and decodes back to the same numbers', { skip }, () => {
  const s = tutorial();
  const { models } = modelMeshes(s), p = meshesPayload(s);
  assert.equal(p.models.length, models.size);
  const m = p.models.find(x => x.path.endsWith('plants_weed2_whole.mdl'));
  // a pooled Buffer's .buffer is the whole pool: slice the view, not the pool
  const view = (b64, T) => { const b = Buffer.from(b64, 'base64'); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
  const pos = view(m.positions, Float32Array), ix = view(m.indices, Uint32Array);
  const src = models.get(m.model);
  assert.equal(pos.length, src.positions.length); assert.equal(ix.length, src.indices.length);
  assert.deepEqual([...pos.slice(0, 9)], [...src.positions.slice(0, 9)]);
  assert.deepEqual([...ix.slice(0, 9)], [...src.indices.slice(0, 9)]);
  assert.equal(m.vertex_count, 112);
});

test('meshes: a level with no geometry sections still opens, with every model left to its proxy', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-mesh-'));
  const file = path.join(dir, 'level.decoded');
  fs.writeFileSync(file, syntheticLevel().buf);
  const s = openSession(file, { archive: 'level/x.bld', entry: 3, deps: gates });
  const { models, stats } = modelMeshes(s);
  assert.equal(models.size, 0);
  assert.equal(stats.with_mesh, 0);
  assert.ok(stats.models > 0, 'the synthetic level does place models');
  const p = meshesPayload(s);
  assert.deepEqual(p.models, []);
});

test('GET /api/meshes serves the payload with its stats', { skip }, async () => {
  const s = await startServer({ session: tutorial(), port: 0, deps: gates });
  try {
    const r = await fetch(`${s.url}/api/meshes`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.stats.with_mesh, 210);
    assert.equal(j.models.length, 210);
    const m = j.models[0];
    for (const k of ['model', 'path', 'units', 'vertex_count', 'triangle_count', 'bounds', 'positions', 'indices']) assert.ok(k in m, `field ${k}`);
    assert.equal(typeof m.positions, 'string');
  } finally { await s.close(); }
});
