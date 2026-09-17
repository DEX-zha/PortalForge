// Placement census (spec 002, level-editor building block). A placement is a type-104 record listed in the
// header table: +0x08 name, +0x24 f32 xyz world position, +0x34 f32 heading (deg), +0xB8 f32 scale (100 = 1),
// +0xA8 -> type-92 behaviour script, +0xC4 -> type-67 companion, +0xDC -> type-64 model record (its name is the
// .mdl path), +0xE0 -> type-66 companion. It is embedded in a wrapper (a script instruction or a layer record)
// and referenced by LAYER records (named type-52 table records such as "Plants", "Loot", "OpeningCS").
// Pointer fields come from the runtime fixup map; nothing here relies on the heuristic header detector.
import { scriptTable } from './script.mjs';
import { levelContext, detectClasses } from './model-resolve.mjs';

function stringAt(buf, graph, v) {
  const s2 = graph.sections[2];
  if (v >>> 24 !== 1) return null;
  const off = v & 0xffffff;
  if (off >= s2.size) return null;
  const p = s2.offset + off;
  const e = buf.indexOf(0, p);
  return buf.toString('latin1', p, e < 0 ? p + 80 : Math.min(e, p + 200));
}

// The class that holds placements in THIS file, detected from the record layout rather than assumed.
const placementTypeOf = (buf, graph, fixups) => {
  const ctx = levelContext(buf, graph, fixups);
  detectClasses(ctx);
  return ctx.placementType;
};

export function listPlacements(buf, graph, fixups, { layer = null, near = null, all = false } = {}) {
  const placementType = placementTypeOf(buf, graph, fixups);
  if (placementType === null) return { total_type104: 0, listed: 0, layers: {}, rows: [] };
  const sec = graph.sections[graph.object_section];
  const tbl = scriptTable(buf, graph);
  const tableOwner = w => {
    let e = null;
    for (const t of tbl) {
      if (t <= w) e = t;
      else break;
    }
    return e;
  };
  const rev = new Map();
  for (const w of fixups.pointer_words) {
    const t = sec.offset + (buf.readUInt32BE(w) & 0x7fffffff);
    if (!rev.has(t)) rev.set(t, []);
    rev.get(t).push(w);
  }
  const ptrSet = new Set(fixups.pointer_words);
  const ref = (p, q) => {
    if (!ptrSet.has(p + q)) return null;
    const t = sec.offset + (buf.readUInt32BE(p + q) & 0x7fffffff);
    return { offset: t, type: buf.readUInt32BE(t), name: stringAt(buf, graph, buf.readUInt32BE(t + 8)) };
  };
  const rows = [];
  for (let i = 0; i < tbl.length; i++) {
    const e = tbl[i];
    if (buf.readUInt32BE(e) !== placementType) continue;
    const span = (tbl[i + 1] ?? sec.offset + sec.size) - e;
    const x = buf.readFloatBE(e + 0x24),
      y = buf.readFloatBE(e + 0x28),
      z = buf.readFloatBE(e + 0x2c);
    const positioned = [x, y, z].every(v => Number.isFinite(v) && Math.abs(v) < 1e4) && (x !== 0 || z !== 0);
    if (!positioned && !all) continue;
    const layers = [
      ...new Set(
        (rev.get(e) ?? [])
          .map(w => tableOwner(w))
          .filter(t => t !== null && t !== e)
          .map(t => ({ offset: t, type: buf.readUInt32BE(t), name: stringAt(buf, graph, buf.readUInt32BE(t + 8)) }))
          .filter(l => l.type === 52 || l.type === 99 || l.type === 107)
          .map(l => l.name),
      ),
    ];
    const model = ref(e, 0xdc),
      script = ref(e, 0xa8);
    const row = {
      offset: e,
      name: stringAt(buf, graph, buf.readUInt32BE(e + 8)),
      refcount: buf.readUInt32BE(e + 4),
      span,
      position: positioned ? [x, y, z].map(v => Math.round(v * 1000) / 1000) : null,
      heading: Math.round(buf.readFloatBE(e + 0x34) * 10) / 10,
      scale: Math.round(buf.readFloatBE(e + 0xb8) * 10) / 10,
      model: model ? { offset: model.offset, type: model.type, path: model.name } : null,
      script: script ? { offset: script.offset, type: script.type, path: script.name } : null,
      layers,
      inbound_words: (rev.get(e) ?? []).length,
    };
    if (layer && !row.layers.some(l => l && l.toLowerCase().includes(layer.toLowerCase()))) continue;
    if (near && positioned) {
      const d = Math.hypot(x - near[0], z - near[1]);
      if (d > near[2]) continue;
      row.distance = Math.round(d * 100) / 100;
    } else if (near) continue;
    rows.push(row);
  }
  const layerCounts = {};
  for (const r of rows) for (const l of r.layers) layerCounts[l] = (layerCounts[l] ?? 0) + 1;
  return {
    total_type104: tbl.filter(e => buf.readUInt32BE(e) === placementType).length,
    placement_type: placementType,
    listed: rows.length,
    layers: layerCounts,
    rows,
  };
}

export function formatPlacements(res, { limit = 60 } = {}) {
  const lines = [
    `placements (class ${res.placement_type}): ${res.total_type104} in the header table, ${res.listed} listed; layers: ${Object.entries(
      res.layers,
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k, v]) => `${k}(${v})`)
      .join(' ')}`,
  ];
  for (const r of res.rows.slice(0, limit))
    lines.push(
      `  0x${r.offset.toString(16)} ${String(r.name ?? '?')
        .slice(0, 30)
        .padEnd(
          30,
        )} ${r.position ? `(${r.position.map(v => v.toFixed(2)).join(', ')})`.padEnd(28) : '(no position)'.padEnd(28)} h${String(r.heading).padStart(5)} s${String(r.scale).padStart(5)} ${(r.model?.path ?? '-').replace(/^.*\//, '').padEnd(34)} ${(r.script?.path ?? '').replace(/^.*\//, '').padEnd(30)} [${r.layers.join(' | ')}]${r.distance !== undefined ? ` d=${r.distance}` : ''}`,
    );
  if (res.rows.length > limit) lines.push(`  … ${res.rows.length - limit} more (use --limit)`);
  return lines.join('\n');
}
