// Real geometry for the editor (feature 004): the meshes of every model the level's placements reference, in the
// model's local space, ready to draw at each placement's transform. Textures and materials are not part of this;
// the view draws these grey.
//
// Decoding reads only the two geometry sections, which no edit ever touches, so the result is computed once per
// session and cached. It needs no runtime map: on a level without one the ownership climb uses structural
// pointers, and on the tutorial that gives the same assignment as the runtime map does.
import { decodeGeometry, assignUnits } from '../igz/gxmesh.mjs';
import { extentOf, largeSurfaceLimit } from '../view/framing.mjs';
import { scriptedPreviews } from './scripted-previews.mjs';
import { sceneRoles } from './scene-roles.mjs';

function concatenate(units) {
  const vertex_count = units.reduce((n, u) => n + u.count, 0);
  const icount = units.reduce((n, u) => n + u.triangles.length, 0);
  const positions = new Float32Array(vertex_count * 3), indices = new Uint32Array(icount);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let vo = 0, io = 0;
  for (const u of units) {
    positions.set(u.vertices, vo * 3);
    for (let k = 0; k < u.vertices.length; k++) {
      const axis = k % 3, value = u.vertices[k];
      min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
    }
    for (let k = 0; k < u.triangles.length; k++) indices[io + k] = u.triangles[k] + vo;
    vo += u.count; io += u.triangles.length;
  }
  return { descriptors: units.map(u => u.descriptor), units: units.length, vertex_count,
    triangle_count: icount / 3, positions, indices, bounds: units.length ? { min, max } : null };
}

// World-space candidates evidenced by the scenery audit. Unassigned is not synonymous with terrain:
// separate-array UI and unresolved local-space resources must never be drawn at the world origin.
// Batches limit draw calls while retaining descriptor provenance and per-batch frustum bounds.
export function partitionGeometry(units, assignment, { maxVertices = 32768, largeSurfaceLimit: limit = Infinity } = {}) {
  const assigned = new Set([...assignment.byModel.values()].flat());
  const chunks = [], unresolved = [];
  const batches = [{ pending: [], vertices: 0, large: false }, { pending: [], vertices: 0, large: true }];
  let count = 0;
  const flush = batch => {
    if (batch.pending.length) chunks.push({ ...concatenate(batch.pending), large_surface: batch.large });
    batch.pending = []; batch.vertices = 0;
  };
  units.forEach((u, i) => {
    if (assigned.has(i)) return;
    if (u.kind !== 'interleaved' || u.frac !== 6) {
      unresolved.push({ descriptor: u.descriptor, kind: u.kind, fraction: u.frac, reason: 'world transform not established' });
      return;
    }
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < u.vertices.length; k++) { const a = k % 3; min[a] = Math.min(min[a], u.vertices[k]); max[a] = Math.max(max[a], u.vertices[k]); }
    const batch = batches[Math.max(...max.map((x, a) => x - min[a])) > limit ? 1 : 0];
    if (batch.vertices + u.count > maxVertices) flush(batch);
    batch.pending.push(u); batch.vertices += u.count; count++;
  });
  batches.forEach(flush);
  return { assigned_unique: assigned.size, unresolved,
    scenery: { space: 'world', confidence: 'LIKELY', editable: false, units: count, chunks } };
}

export function modelMeshes(session) {
  if (session._meshes) return session._meshes;
  const buf = session.buffer, graph = session.graph;
  const models = [...new Set(session.placements.filter(p => p.model?.offset != null).map(p => p.model.offset))];
  const paths = new Map(session.placements.filter(p => p.model?.offset != null).map(p => [p.model.offset, p.model.path]));
  const geo = decodeGeometry(buf, graph);
  const a = geo.units.length ? assignUnits(buf, graph, geo.units, models, session.fixups) : { byModel: new Map(models.map(m => [m, []])), bounds: new Map(), shared: 0, world: 0, structural: !session.fixups };
  const out = new Map();
  for (const m of models) {
    const units = (a.byModel.get(m) ?? []).map(i => geo.units[i]);
    if (!units.length) continue;
    out.set(m, { ...concatenate(units), model: m, path: paths.get(m) ?? null,
      fractions: [...new Set(units.map(u => u.frac))], bounds: a.bounds.get(m) ?? null });
  }
  const partition = partitionGeometry(geo.units, a, { largeSurfaceLimit: largeSurfaceLimit(extentOf(session.placements.map(p => p.position)).reach) });
  session._meshes = {
    models: out,
    scenery: partition.scenery, unresolved: partition.unresolved,
    stats: { models: models.length, with_mesh: out.size, draw_units: geo.units.length, descriptors: geo.descriptors.length,
      complete: !geo.stop, stop: geo.stop ?? null, owned: [...a.byModel.values()].reduce((n, l) => n + l.length, 0), shared: a.shared, world: a.world, structural: a.structural,
      assigned_unique: partition.assigned_unique, scenery: partition.scenery.units, unresolved: partition.unresolved.length },
  };
  return session._meshes;
}

// The wire form of the meshes: typed arrays as base64 little-endian, which the view turns straight back into
// Float32Array / Uint32Array without parsing numbers out of text.
export function meshesPayload(session) {
  const { models, stats, scenery, unresolved } = modelMeshes(session);
  const b64 = arr => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
  const encode = m => ({ ...m, positions: b64(m.positions), indices: b64(m.indices) });
  return {
    stats,
    models: [...models.values()].map(encode),
    scenery: { ...scenery, chunks: scenery.chunks.map(encode) }, unresolved,
    scripted_previews: scriptedPreviews(session),
    scene_roles: sceneRoles(session),
  };
}
