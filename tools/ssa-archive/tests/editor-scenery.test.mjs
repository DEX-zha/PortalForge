import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { partitionGeometry, modelMeshes, meshesPayload } from '../src/editor/meshes.mjs';
import { openSession, applyEdit, undo } from '../src/editor/session.mjs';
import { decodeMeshPayload } from '../src/view/mesh-data.mjs';
import { createScenery, disposeScenery } from '../src/view/scenery.mjs';
import * as THREE from 'three';

const unit = (descriptor, kind = 'interleaved', frac = 6) => ({
  descriptor,
  kind,
  frac,
  count: 3,
  vertices: new Float32Array([90, 6, 40, 94, 6, 40, 90, 6, 44]),
  triangles: new Uint32Array([0, 2, 1]),
});

test('scenery partitions decoded geometry without duplicating shared or already placed world units', () => {
  const units = [unit(0), unit(1), unit(2, 'separate', 10), unit(3, 'interleaved', 8), unit(4)];
  const a = {
    byModel: new Map([
      [10, [0]],
      [11, [0]],
    ]),
  };
  const p = partitionGeometry(units, a, { maxVertices: 3 });
  assert.equal(p.assigned_unique, 1);
  assert.deepEqual(
    p.scenery.chunks.flatMap(c => c.descriptors),
    [1, 4],
  );
  assert.deepEqual(
    p.unresolved.map(u => u.descriptor),
    [2, 3],
  );
  assert.equal(p.scenery.units + p.unresolved.length + p.assigned_unique, units.length);
  assert.equal(p.scenery.space, 'world');
  assert.equal(p.scenery.editable, false);
  assert.equal(p.scenery.chunks.length, 2);
  const joined = partitionGeometry(units, a).scenery.chunks[0];
  assert.deepEqual([...joined.indices], [0, 2, 1, 3, 5, 4]);
  assert.deepEqual([...joined.positions.slice(0, 3)], [90, 6, 40], 'world coordinates must not be placed again');
});

test('scenery scene group preserves world coordinates and is separate from selectable placements', () => {
  const { scenery } = partitionGeometry([unit(7)], { byModel: new Map() });
  const material = new THREE.MeshLambertMaterial();
  const group = createScenery(scenery, material);
  assert.equal(group.children.length, 1);
  const mesh = group.children[0];
  assert.equal(mesh.isInstancedMesh, undefined);
  assert.deepEqual(mesh.position.toArray(), [0, 0, 0]);
  assert.deepEqual(mesh.scale.toArray(), [1, 1, 1]);
  assert.deepEqual([...mesh.geometry.attributes.position.array], [...unit(7).vertices]);
  assert.equal(mesh.userData.editable, false);
  assert.deepEqual(mesh.userData.descriptors, [7]);
  assert.ok(mesh.geometry.boundingSphere.radius > 0);
  let disposed = 0;
  mesh.geometry.addEventListener('dispose', () => disposed++);
  disposeScenery(group);
  assert.equal(disposed, 1);
  material.dispose();
});

test('large scenery surfaces are batched separately so backgrounds can be wireframe without hiding terrain', () => {
  const huge = unit(8);
  huge.vertices[0] = -500;
  huge.vertices[3] = 500;
  const p = partitionGeometry([unit(7), huge, unit(9)], { byModel: new Map() }, { largeSurfaceLimit: 100 });
  const solid = p.scenery.chunks.filter(c => !c.large_surface),
    large = p.scenery.chunks.filter(c => c.large_surface);
  assert.deepEqual(
    solid.flatMap(c => c.descriptors),
    [7, 9],
  );
  assert.deepEqual(
    large.flatMap(c => c.descriptors),
    [8],
  );
  const material = new THREE.MeshLambertMaterial(),
    wire = new THREE.MeshLambertMaterial({ wireframe: true });
  const group = createScenery(p.scenery, material, wire);
  assert.equal(group.children.find(m => m.userData.descriptors.includes(8)).material, wire);
  assert.equal(group.children.find(m => m.userData.descriptors.includes(7)).material, material);
  disposeScenery(group);
  material.dispose();
  wire.dispose();
});

test('mesh wire decoder accepts an older payload without scenery', () => {
  const decoded = decodeMeshPayload({ models: [] });
  assert.equal(decoded.models.size, 0);
  assert.deepEqual(decoded.scenery.chunks, []);
});

for (const [name, folder, world, unresolved, excluded] of [
  ['tutorial', 'tutorial-bld', 1584, 3, [360, 583, 1593, 1594, 1595]],
  ['Mining', 'mining-bld', 641, 5, [650, 651, 654, 655, 656]],
]) {
  const file = fileURLToPath(
    new URL(`../../../.local/workspaces/${folder}/entries/3-level.bld.decoded`, import.meta.url),
  );
  test(
    `scenery ${name}: serves missing terrain, excludes UI and preserves edits`,
    { skip: !fs.existsSync(file) && 'local sample absent' },
    () => {
      const s = openSession(file, { deps: { gates: () => ({ status: 'PASS' }) } });
      const original = Buffer.from(s.buffer);
      const result = modelMeshes(s),
        payload = meshesPayload(s),
        view = decodeMeshPayload(payload);
      assert.equal(result.stats.scenery, world);
      assert.equal(result.stats.unresolved, unresolved);
      assert.equal(result.stats.assigned_unique + world + unresolved, result.stats.draw_units);
      const ids = payload.scenery.chunks.flatMap(c => c.descriptors);
      assert.equal(new Set(ids).size, world);
      for (const id of excluded) assert.ok(!ids.includes(id), `descriptor ${id} must not become scenery`);
      assert.ok(view.scenery.chunks.length < 30, 'batch scenery instead of one draw call per descriptor');
      for (const c of view.scenery.chunks) {
        assert.equal(c.positions.length, c.vertex_count * 3);
        assert.equal(c.indices.length, c.triangle_count * 3);
        assert.ok(c.indices.every(i => i < c.vertex_count));
      }
      if (name === 'tutorial') {
        assert.ok(ids.includes(1441), 'missing surface near the spawn must reach the browser');
        const target =
          s.placements.find(p => p.name === 'sunflower(2)') ??
          s.placements.find(p => p.model?.path?.endsWith('plant_sunflower_whole.mdl'));
        assert.ok(target);
        const before = [...target.position];
        applyEdit(s, { kind: 'transform', target: target.offset, position: [before[0] + 1, before[1], before[2]] });
        assert.equal(modelMeshes(s).scenery, result.scenery, 'placement edits do not rebuild or move world data');
        undo(s);
      }
      assert.deepEqual(s.buffer, original, 'reading or undoing a placement must leave geometry untouched');
    },
  );
}
