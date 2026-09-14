// Real geometry for the editor (feature 004): the meshes of every model the level's placements reference, in the
// model's local space, ready to draw at each placement's transform. Textures and materials are not part of this;
// the view draws these grey.
//
// Decoding reads only the two geometry sections, which no edit ever touches, so the result is computed once per
// session and cached. It needs no runtime map: on a level without one the ownership climb uses structural
// pointers, and on the tutorial that gives the same assignment as the runtime map does.
import { decodeGeometry, assignUnits } from '../igz/gxmesh.mjs';

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
    // one vertex array and one index array per model, units concatenated with their indices rebased
    const vcount = units.reduce((n, u) => n + u.count, 0), icount = units.reduce((n, u) => n + u.triangles.length, 0);
    const positions = new Float32Array(vcount * 3), indices = new Uint32Array(icount);
    let vo = 0, io = 0;
    for (const u of units) { positions.set(u.vertices, vo * 3); for (let k = 0; k < u.triangles.length; k++) indices[io + k] = u.triangles[k] + vo; vo += u.count; io += u.triangles.length; }
    out.set(m, { model: m, path: paths.get(m) ?? null, units: units.length, vertex_count: vcount, triangle_count: icount / 3, fractions: [...new Set(units.map(u => u.frac))], bounds: a.bounds.get(m) ?? null, positions, indices });
  }
  session._meshes = {
    models: out,
    stats: { models: models.length, with_mesh: out.size, draw_units: geo.units.length, descriptors: geo.descriptors.length,
      complete: !geo.stop, stop: geo.stop ?? null, owned: [...a.byModel.values()].reduce((n, l) => n + l.length, 0), shared: a.shared, world: a.world, structural: a.structural },
  };
  return session._meshes;
}

// The wire form of the meshes: typed arrays as base64 little-endian, which the view turns straight back into
// Float32Array / Uint32Array without parsing numbers out of text.
export function meshesPayload(session) {
  const { models, stats } = modelMeshes(session);
  const b64 = arr => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
  return {
    stats,
    models: [...models.values()].map(m => ({ model: m.model, path: m.path, units: m.units, vertex_count: m.vertex_count, triangle_count: m.triangle_count, fractions: m.fractions, bounds: m.bounds, positions: b64(m.positions), indices: b64(m.indices) })),
  };
}
