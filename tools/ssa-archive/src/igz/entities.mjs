// Entity field candidates (spec 002 US2): world-scale float triples inside objects, minus values
// that are dimensions in feet converted to metres (multiples of 1.524 = 5 ft) and min/max box pairs
// (two triples where each max component >= min component), which are trigger volumes, not positions.
const FOOT_UNIT = 1.524, EPS = 1e-3;

export const isFootMultiple = v => v !== 0 && Math.abs(v / FOOT_UNIT - Math.round(v / FOOT_UNIT)) < EPS;
export const isDimensionTriple = t => t.every(v => v === 0 || isFootMultiple(v)) && t.some(v => v !== 0);
export const isBoxPair = (a, b) => a.every((v, i) => Number.isFinite(v) && Number.isFinite(b[i]) && b[i] >= v) && a.some((v, i) => b[i] > v);

// Returns candidate position triples of one object: {offset, values, flags}.
export function positionCandidates(buf, object, { min = -20000, max = 20000, minAbs = 0.5 } = {}) {
  const out = [];
  for (let q = 12; q + 12 <= object.size; q += 4) {
    const t = [0, 4, 8].map(k => buf.readFloatBE(object.offset + q + k));
    if (!t.every(v => Number.isFinite(v) && v >= min && v <= max)) continue;
    if (!t.some(v => Math.abs(v) >= minAbs)) continue;
    if (t.some(v => Math.abs(v) !== 0 && (Math.abs(v) < 1e-4 || Math.abs(v) > 1e5))) continue;
    const flags = [];
    if (isDimensionTriple(t)) flags.push('dimension');
    if (q + 24 <= object.size) { const n = [12, 16, 20].map(k => buf.readFloatBE(object.offset + q + k)); if (n.every(Number.isFinite) && isBoxPair(t, n)) flags.push('box_min'); }
    if (q >= 24) { const p = [-12, -8, -4].map(k => buf.readFloatBE(object.offset + q + k)); if (p.every(Number.isFinite) && isBoxPair(p, t)) flags.push('box_max'); }
    out.push({ offset: object.offset + q, field: q, values: t.map(v => Math.round(v * 1000) / 1000), flags });
  }
  return out;
}

// Triples near a target position across the whole graph, ranked by distance; dimensions excluded by default.
export function near(buf, graph, target, { tol = 3, includeDimensions = false } = {}) {
  const [x, y, z] = target; const rows = [];
  for (const o of graph.objects) {
    for (const c of positionCandidates(buf, o, { minAbs: 0 })) {
      if (!includeDimensions && c.flags.includes('dimension')) continue;
      const d = Math.hypot(c.values[0] - x, c.values[1] - y, c.values[2] - z);
      if (d <= tol) rows.push({ ...c, object: { offset: o.offset, type_name: o.type_name, id: o.id }, distance: Math.round(d * 1000) / 1000 });
    }
  }
  return rows.sort((a, b) => a.distance - b.distance);
}

// Per-type statistics of position-like fields (which offsets carry triples, how often).
export function fieldStatistics(buf, graph, { minAbs = 1 } = {}) {
  const stats = new Map();
  for (const o of graph.objects) {
    for (const c of positionCandidates(buf, o, { minAbs })) {
      if (c.flags.includes('dimension')) continue;
      const key = `${o.type_name || 'type#' + o.type}+0x${c.field.toString(16)}`;
      const e = stats.get(key) ?? { type_name: o.type_name, field: c.field, count: 0, boxes: 0 };
      e.count++; if (c.flags.includes('box_min')) e.boxes++; stats.set(key, e);
    }
  }
  return [...stats.values()].sort((a, b) => b.count - a.count);
}
