import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '../src/igz/graph.mjs';
import { resolveAll } from '../src/igz/model-resolve.mjs';
import {
  decodeGeometry,
  parseDescriptors,
  walkBlocks,
  triangulate,
  assignUnits,
  descriptorSection,
  geometrySection,
} from '../src/igz/gxmesh.mjs';

// Feature 004. The GX geometry decoder is validated the way the placement model was: on the whole of a real level,
// by counting, and against a second level the walk was never tuned on. Nothing here depends on type names.

const here = path.dirname(fileURLToPath(import.meta.url));
const TUTORIAL = path.resolve(here, '../../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded');
const MINING = path.resolve(here, '../../../.local/workspaces/mining-bld/entries/3-level.bld.decoded');
const FIXUPS = path.resolve(here, '../../../.local/dolphin-evidence/ptr-scan3-fixups.json');
const have = fs.existsSync(TUTORIAL) && fs.existsSync(MINING) && fs.existsSync(FIXUPS);
const skip = !have && 'local samples absent';

const cache = new Map();
function level(file) {
  if (!cache.has(file)) {
    const buf = fs.readFileSync(file);
    const graph = buildGraph(buf);
    cache.set(file, { buf, graph, geo: decodeGeometry(buf, graph) });
  }
  return cache.get(file);
}
const modelsOf = (buf, graph, fixups) => [
  ...new Set(
    resolveAll(buf, graph, fixups)
      .rows.filter(r => r.model?.offset != null)
      .map(r => r.model.offset),
  ),
];
const modelPath = (buf, graph, fixups, name) =>
  resolveAll(buf, graph, fixups).rows.find(r => r.model?.path?.endsWith(name))?.model.offset;

test('gxmesh: a triangle strip alternates winding, a fan pivots on its first vertex, quads split in two', () => {
  assert.deepEqual([...triangulate([{ op: 0x98, indices: [0, 1, 2, 3, 4] }])], [0, 1, 2, 2, 1, 3, 2, 3, 4]);
  assert.deepEqual([...triangulate([{ op: 0xa0, indices: [0, 1, 2, 3] }])], [0, 1, 2, 0, 2, 3]);
  assert.deepEqual(
    [...triangulate([{ op: 0x90, indices: [5, 6, 7, 8] }])],
    [5, 6, 7],
    'a trailing vertex that closes no triangle is dropped',
  );
  assert.deepEqual([...triangulate([{ op: 0x80, indices: [0, 1, 2, 3] }])], [0, 1, 2, 0, 2, 3]);
  assert.equal(triangulate([]).length, 0);
});

test('gxmesh: the whole of the tutorial geometry section walks in sequence', { skip }, () => {
  const { geo } = level(TUTORIAL);
  assert.equal(geo.stop, null, geo.stop && `stopped at #${geo.stop.descriptor}: ${geo.stop.why}`);
  assert.equal(geo.descriptors.length, 2264);
  assert.equal(geo.units.length, 2264);
  const verts = geo.units.reduce((a, u) => a + u.count, 0),
    tris = geo.units.reduce((a, u) => a + u.triangles.length / 3, 0);
  assert.equal(verts, 416025);
  assert.equal(tris, 526834);
  assert.ok(geo.consumed > geo.size * 0.99, 'the walk consumes the section, not a prefix of it');
});

test('gxmesh: every index of every strip addresses a vertex of its own block', { skip }, () => {
  for (const u of level(TUTORIAL).geo.units) {
    let max = -1;
    for (const i of u.triangles) if (i > max) max = i;
    assert.ok(max < u.count, `#${u.descriptor} indexes vertex ${max} of ${u.count}`);
  }
});

test(
  'gxmesh: world chunks are interleaved at 2^-6 and placed models are separate arrays at finer fractions',
  { skip },
  () => {
    const { geo } = level(TUTORIAL);
    const inter = geo.units.filter(u => u.kind === 'interleaved'),
      sep = geo.units.filter(u => u.kind === 'separate');
    assert.equal(inter.length, 1586);
    assert.equal(sep.length, 678);
    assert.ok(inter.every(u => u.frac === 6));
    assert.ok(sep.every(u => u.frac >= 6 && u.frac <= 10));
    assert.ok(sep.filter(u => u.frac === 10).length > 600, 'most props are quantised to 1/1024');
  },
);

test(
  'gxmesh: descriptors say what the blocks contain, and both index widths occur below 256 vertices',
  { skip },
  () => {
    const { buf, graph } = level(TUTORIAL);
    const d = parseDescriptors(buf, graph);
    assert.equal(d.length, 2264);
    assert.equal(d[0].count, 60);
    assert.equal(d[0].stride, 12);
    assert.equal(d[0].attrs.length, 2);
    assert.ok(
      d.every(x => x.sizes.length === 0 || x.sizes.reduce((a, b) => a + b, 0) === x.stride),
      'the array sizes add up to the stride',
    );
    const w = walkBlocks(buf, graph, d);
    const small = w.blocks.filter(b => b.descriptor.count <= 255);
    assert.ok(
      small.some(b => b.indexBytes === 2) && small.some(b => b.indexBytes === 1),
      'index width is not decided by the vertex count',
    );
    assert.ok(
      w.blocks.every(b => (b.descriptor.count > 255 ? b.indexBytes === 2 : true)),
      'above 255 vertices the indices must be 16-bit',
    );
  },
);

test('gxmesh: every placed model of the tutorial owns a mesh that lies inside its declared bounds', { skip }, () => {
  const { buf, graph, geo } = level(TUTORIAL);
  const fixups = JSON.parse(fs.readFileSync(FIXUPS, 'utf8'));
  const models = modelsOf(buf, graph, fixups);
  const a = assignUnits(buf, graph, geo.units, models, fixups);
  assert.equal(models.length, 210);
  assert.ok(
    [...a.byModel.values()].every(l => l.length > 0),
    'a model with no mesh',
  );
  for (const [m, list] of a.byModel) {
    const bb = a.bounds.get(m);
    if (!bb) continue;
    const ext = Math.max(...[0, 1, 2].map(k => bb.max[k] - bb.min[k]));
    for (const i of list) {
      const u = geo.units[i];
      for (let v = 0; v < u.count; v++)
        for (let k = 0; k < 3; k++) {
          const x = u.vertices[3 * v + k];
          assert.ok(
            x >= bb.min[k] - 0.05 * ext - 0.05 && x <= bb.max[k] + 0.05 * ext + 0.05,
            `model 0x${m.toString(16)} unit #${u.descriptor} leaves its bounds`,
          );
        }
    }
  }
  assert.equal(a.world, 1587, 'world geometry is left to the world');
});

test(
  'gxmesh: the sunflower is seven draw units including a head shared with a second sunflower model',
  { skip },
  () => {
    const { buf, graph, geo } = level(TUTORIAL);
    const fixups = JSON.parse(fs.readFileSync(FIXUPS, 'utf8'));
    const models = modelsOf(buf, graph, fixups);
    const a = assignUnits(buf, graph, geo.units, models, fixups);
    const sun = modelPath(buf, graph, fixups, 'plant_sunflower_whole.mdl'),
      other = modelPath(buf, graph, fixups, 'flower_sunflower1.mdl'),
      weed = modelPath(buf, graph, fixups, 'plants_weed2_whole.mdl');
    assert.equal(a.byModel.get(sun).length, 7);
    assert.equal(
      a.byModel.get(sun).reduce((n, i) => n + geo.units[i].count, 0),
      736,
    );
    const head = a.byModel.get(sun).find(i => geo.units[i].count === 326);
    assert.ok(a.byModel.get(other).includes(head), 'the 326-vertex head belongs to both sunflower models');
    assert.deepEqual(
      a.byModel.get(weed).map(i => geo.units[i].count),
      [112],
    );
  },
);

test(
  'gxmesh: without a runtime map the assignment is the same, so no level needs a boot to get its meshes',
  { skip },
  () => {
    const { buf, graph, geo } = level(TUTORIAL);
    const fixups = JSON.parse(fs.readFileSync(FIXUPS, 'utf8'));
    const models = modelsOf(buf, graph, fixups);
    const withMap = assignUnits(buf, graph, geo.units, models, fixups),
      without = assignUnits(buf, graph, geo.units, models, null);
    assert.equal(without.structural, true);
    for (const m of models)
      assert.deepEqual(
        [...without.byModel.get(m)].sort(),
        [...withMap.byModel.get(m)].sort(),
        `model 0x${m.toString(16)} differs`,
      );
  },
);

test('gxmesh: Mining, never used to build the decoder, walks entirely and gives every model a mesh', { skip }, () => {
  const { buf, graph, geo } = level(MINING);
  assert.equal(geo.stop, null, geo.stop && `stopped at #${geo.stop.descriptor}: ${geo.stop.why}`);
  assert.equal(geo.units.length, geo.descriptors.length);
  assert.ok(geo.units.length > 800);
  assert.notEqual(
    buf.readUInt32BE(descriptorSection(graph).offset + 4),
    0xf,
    'the descriptor type index is not the tutorial one',
  );
  assert.equal(geometrySection(graph).tag, 51);
  const models = modelsOf(buf, graph, null);
  const a = assignUnits(buf, graph, geo.units, models, null);
  assert.equal(models.length, 134);
  assert.ok([...a.byModel.values()].every(l => l.length > 0));
});
