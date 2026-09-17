// Placement editor (spec 002, first experimental level editor). Data model, from finding igz.placement.type104-record:
//   Placement = { position (+0x24 f32 xyz), rotation (+0x34 f32 heading deg), scale (+0xB8 f32, 100 = 1.0),
//                 behavior (+0xA8 -> type-92 script, may be absent), model (+0xDC -> type-64 record named by the .mdl path),
//                 layer (named type-52 records whose pointer words reference the placement) }
// Every placement is a type-104 record listed in the IGZ header table. Editing = in-place bytes (zero shift).
// Duplication = same-size replacement of a sacrificable record (planReplaceRecord). Two recipes:
//   - "wrapper-proven": both placements are embedded at +0x48 of type-111 wrappers of equal size -> the recipe
//     confirmed by m3-level_027_tutorial-e3-1789303984407 / 1789304493862 (copy the wrapper, keep its name and
//     companion pointers);
//   - "t104-generic": same-span type-104 records without matching wrappers -> same logic on the record itself.
//     Screening-confirmed by m3-level_027_tutorial-e3-1789315647217 (a flowerB placement copied over a weed slot
//     rendered at the new position); it touches no shared record, which makes it the cleaner path when available.
// Safety: a placement whose +0xA8 is a confirmed pointer (behaviour script) is marked "scripted / potentially unsafe"
// (level.pushblock.track-dependency: relocating a track-bound push block froze the game). Cutscene markers
// ("CS_*", layers OpeningCS/ClosingCS/...) are marked too: moving them changes cutscenes, not visible props.
import fs from 'node:fs';
import path from 'node:path';
import { buildGraph } from '../igz/graph.mjs';
import { scriptTable } from '../igz/script.mjs';
import { listPlacements } from '../igz/placements.mjs';
import { levelContext, detectClasses } from '../igz/model-resolve.mjs';
import { planReplaceRecord } from '../igz/relocate.mjs';
import { assessReplacement, worst, blocked } from './safety.mjs';

export const FIELDS = {
  position: 0x24,
  heading: 0x34,
  scale: 0xb8,
  behavior: 0xa8,
  model: 0xdc,
  name: 0x08,
  companions: [0xc4, 0xe0],
};
export const COMPANION_TYPES = new Set([65, 66, 67, 147]);
const WRAPPER_EMBED = 0x48;

// The placement class is per file, so it is detected once per level rather than assumed (igz.types.per-file-indices).
// The wrapper class is whatever sits 0x48 before a placement when one does; it is read, never assumed either.
const typeCache = new WeakMap();
function placementTypeOf(level) {
  if (typeCache.has(level)) return typeCache.get(level);
  const ctx = levelContext(level.buf, level.graph, level.fixups);
  detectClasses(ctx);
  typeCache.set(level, ctx.placementType);
  return ctx.placementType;
}

export function openLevel(file, fixupsFile) {
  const buf = fs.readFileSync(file);
  const fixups = JSON.parse(fs.readFileSync(fixupsFile, 'utf8'));
  const graph = buildGraph(buf, { fields: false });
  const table = scriptTable(buf, graph);
  return {
    file: path.resolve(file),
    buf,
    fixups,
    graph,
    table,
    ptrSet: new Set(fixups.pointer_words),
    sec: graph.sections[graph.object_section],
  };
}

// header-table record: type from word 0, size = distance to the next table entry (no heuristic header detection)
export function tableRecord(level, offset, buf = level.buf) {
  const i = level.table.indexOf(offset);
  if (i < 0) return null;
  const end = level.table[i + 1] ?? level.sec.offset + level.sec.size;
  const type = buf.readUInt32BE(offset);
  return {
    offset,
    type,
    size: end - offset,
    type_name: level.graph.types?.[type]?.name ?? null,
    id: buf.readUInt32BE(offset + 8),
  };
}

export function classify(row) {
  const reasons = [];
  if (row.script)
    reasons.push(
      `behaviour script ${row.script.path ? row.script.path.replace(/^.*\//, '') : '0x' + row.script.offset.toString(16)} at +0xA8`,
    );
  if (
    /^CS_|^Cam_|Camera|PortalEntry|_Initialize$/.test(row.name ?? '') ||
    row.layers.some(l => /CS\b|Cams?\b|Camera/.test(l ?? ''))
  )
    reasons.push('cutscene/camera marker (not a visible prop)');
  if (!row.model) reasons.push('no model record at +0xDC');
  const safety = row.script ? 'scripted / potentially unsafe' : reasons.length ? 'marker / no model' : 'static';
  return { safety, reasons };
}

export function listByLayer(level, opts = {}) {
  const res = listPlacements(level.buf, level.graph, level.fixups, opts);
  const layers = new Map();
  const unlayered = [];
  for (const r of res.rows) {
    r.safety = classify(r);
    if (!r.layers.length) {
      unlayered.push(r);
      continue;
    }
    for (const l of r.layers) {
      if (!layers.has(l)) layers.set(l, []);
      layers.get(l).push(r);
    }
  }
  const out = [...layers.entries()]
    .map(([name, rows]) => ({
      name,
      count: rows.length,
      scripted: rows.filter(r => r.script).length,
      static: rows.filter(r => r.safety.safety === 'static').length,
      rows,
    }))
    .sort((a, b) => b.count - a.count);
  return { total_type104: res.total_type104, listed: res.listed, layers: out, unlayered };
}

export function getPlacement(level, offset) {
  const rec = tableRecord(level, offset);
  const placementType = placementTypeOf(level);
  if (!rec || placementType === null || rec.type !== placementType)
    throw Object.assign(
      new Error(
        `0x${offset.toString(16)} is not a placement record of this level (its placements are class ${placementType ?? 'undetected'})`,
      ),
      { exitCode: 1 },
    );
  const res = listPlacements(level.buf, level.graph, level.fixups, { all: true });
  const row = res.rows.find(r => r.offset === offset);
  row.safety = classify(row);
  row.span = rec.size;
  const w = level.graph.objects.find(o => o.offset === offset - WRAPPER_EMBED);
  row.wrapper = w ? { offset: w.offset, type: w.type, size: w.size } : null;
  return row;
}

// In-place transform edit: only the requested floats change. Refuses scripted placements unless allowScripted.
export function setTransform(level, offset, { position = null, heading = null, scale = null, allowScripted = false }) {
  const row = getPlacement(level, offset);
  if (row.script && !allowScripted)
    throw Object.assign(
      new Error(
        `${row.name} is ${row.safety.safety} (${row.safety.reasons.join('; ')}); pass --allow-scripted to edit it anyway`,
      ),
      { exitCode: 1 },
    );
  const out = Buffer.from(level.buf);
  const changes = [];
  const touched = new Set();
  const put = (q, v, label) => {
    const old = level.buf.readFloatBE(offset + q);
    out.writeFloatBE(v, offset + q);
    touched.add(offset + q);
    changes.push({
      field: `+0x${q.toString(16)}`,
      label,
      type: 'f32be',
      old: Math.round(old * 1000) / 1000,
      new: v,
      old_hex: level.buf.subarray(offset + q, offset + q + 4).toString('hex'),
      new_hex: out.subarray(offset + q, offset + q + 4).toString('hex'),
    });
  };
  if (position) {
    if (position.length !== 3 || position.some(v => !Number.isFinite(v)))
      throw Object.assign(new Error('position needs three finite numbers'), { exitCode: 3 });
    put(0x24, position[0], 'x');
    put(0x28, position[1], 'y');
    put(0x2c, position[2], 'z');
  }
  if (heading !== null) put(0x34, heading, 'heading');
  if (scale !== null) put(0xb8, scale, 'scale');
  if (!changes.length)
    throw Object.assign(new Error('nothing to change (give --pos, --heading or --scale)'), { exitCode: 3 });
  let outside = 0;
  for (let p = 0; p + 4 <= out.length; p += 4)
    if (out.readUInt32BE(p) !== level.buf.readUInt32BE(p) && !touched.has(p)) outside++;
  const plan = {
    mode: 'set-transform',
    placement: describe(row),
    changes,
    validation: {
      status: outside ? 'INVALID' : 'VALID',
      failures: outside ? [{ stage: 'validation', reason: `${outside} unexpected word(s) changed` }] : [],
    },
    file_length_unchanged: out.length === level.buf.length,
    findings: ['igz.placement.type104-record', 'level.prop.scriptset-placement'],
  };
  return { buffer: out, plan };
}

// The safety rules read the stable placement shape; the editor's row carries the same facts under other keys.
const forSafety = r => ({
  name: r.name,
  span: r.span ?? 0,
  behavior: r.script ? { path: r.script.path ?? null, offset: r.script.offset } : null,
  model: {
    status: r.model ? 'direct' : 'absent',
    field: FIELDS.model,
    offset: r.model?.offset ?? null,
    path: r.model?.path ?? null,
  },
  model_candidates: [],
});

const describe = r => ({
  offset: r.offset,
  name: r.name,
  layers: r.layers,
  model: r.model ? r.model.path : null,
  script: r.script ? r.script.path : null,
  position: r.position,
  heading: r.heading,
  scale: r.scale,
  safety: r.safety,
  wrapper: r.wrapper ?? null,
});

// Auto keep-list for a victim record: its name, and every confirmed pointer field whose target is a companion record.
function autoKeep(level, rec, nameField) {
  const keep = [nameField];
  for (let q = 12; q + 4 <= rec.size; q += 4) {
    if (!level.ptrSet.has(rec.offset + q)) continue;
    const t = level.sec.offset + (level.buf.readUInt32BE(rec.offset + q) & 0x7fffffff);
    if (t >= rec.offset && t < rec.offset + rec.size) continue;
    if (COMPANION_TYPES.has(level.buf.readUInt32BE(t))) keep.push(q);
  }
  return [...new Set(keep)];
}

export function replacePlacement(
  level,
  source,
  victim,
  {
    position = null,
    heading = null,
    scale = null,
    keep = 'auto',
    allowScripted = false,
    findingId = 'level.prop.scriptset-placement',
    findingsOpts = {},
  } = {},
) {
  const S = getPlacement(level, source),
    V = getPlacement(level, victim);
  if (S.script && !allowScripted)
    throw Object.assign(
      new Error(
        `source ${S.name} is ${S.safety.safety} (${S.safety.reasons.join('; ')}); pass --allow-scripted to duplicate it anyway`,
      ),
      { exitCode: 1 },
    );
  const edits = [];
  const push = (q, v) => edits.push({ offset: q, type: 'f32be', value: v });
  let recipe,
    src,
    vic,
    keepList,
    resolve = null,
    refcount,
    base,
    copied;
  if (S.wrapper && V.wrapper && S.wrapper.size === V.wrapper.size) {
    recipe = 'wrapper-proven';
    src = S.wrapper.offset;
    vic = V.wrapper.offset;
    refcount = 'one';
    base = WRAPPER_EMBED;
    copied = { source: S.wrapper.size, victim: V.wrapper.size };
    keepList =
      keep === 'auto'
        ? autoKeep(level, { offset: V.wrapper.offset, size: V.wrapper.size }, WRAPPER_EMBED + FIELDS.name)
        : keep;
  } else {
    recipe = 't104-generic';
    src = source;
    vic = victim;
    refcount = 'victim';
    base = 0;
    copied = { source: tableRecord(level, source).size, victim: tableRecord(level, victim).size };
    resolve = (buf, off) => tableRecord(level, off, buf);
    keepList = keep === 'auto' ? autoKeep(level, tableRecord(level, victim), FIELDS.name) : keep;
  }
  if (position) {
    push(base + 0x24, position[0]);
    push(base + 0x28, position[1]);
    push(base + 0x2c, position[2]);
  }
  if (heading !== null) push(base + 0x34, heading);
  if (scale !== null) push(base + 0xb8, scale);
  const r = planReplaceRecord(level.buf, level.fixups, {
    source: src,
    victim: vic,
    keep: keepList,
    findingId,
    edits,
    findingsOpts,
    extraFindings: ['igz.placement.type104-record'],
    resolve,
    refcount,
  });
  r.plan.recipe = recipe;
  r.plan.placement_source = describe(S);
  r.plan.placement_victim = describe(V);
  if (recipe.startsWith('t104'))
    r.plan.validation.warnings = [
      ...(r.plan.validation.warnings ?? []),
      'recipe t104-generic is screening-confirmed (one boot, m3-level_027_tutorial-e3-1789315647217); SC-004 needs a second identical boot before it counts as PASS',
    ];
  // Safety rules, from the plan's own shared-record report: what this replacement changes beyond the slot.
  const sharedInVictim = (r.plan.shared_records ?? [])
    .filter(x => x.bytes_changed)
    .map(x => ({ offset: x.offset, users: x.external_users + 1, path: x.name_before }));
  r.plan.safety = assessReplacement(forSafety(S), forSafety(V), {
    hasRuntimeMap: !!level.ptrSet,
    sharedInVictim,
    spanMatch: copied.source === copied.victim,
    copied,
  });
  r.plan.safety_worst = worst(r.plan.safety);
  if (blocked(r.plan.safety)) {
    r.plan.validation.status = 'INVALID';
    r.plan.validation.failures.push(
      ...r.plan.safety
        .filter(x => x.severity === 'blocking')
        .map(x => ({ stage: 'safety', reason: x.id + ': ' + x.message })),
    );
  }
  return r;
}

export function formatLayers(res, { limit = 40 } = {}) {
  const lines = [
    `type-104 placements: ${res.total_type104} in the header table, ${res.listed} listed in ${res.layers.length} layer(s)${res.unlayered.length ? `, ${res.unlayered.length} unlayered` : ''}`,
    'flags:  (blank) static   !  scripted / potentially unsafe   ?  marker or no model',
  ];
  let shown = 0;
  for (const L of res.layers) {
    lines.push(`\n[${L.name}]  ${L.count} placement(s): ${L.static} static, ${L.scripted} scripted`);
    for (const r of L.rows) {
      if (shown++ >= limit) break;
      lines.push(formatRow(r));
    }
    if (shown >= limit) {
      lines.push(`  ... (limit ${limit}; use --limit or --layer)`);
      break;
    }
  }
  return lines.join('\n');
}

export function formatRow(r) {
  const flag = r.safety.safety === 'static' ? '   ' : r.script ? ' ! ' : ' ? ';
  const model = r.model && r.model.path ? r.model.path.replace(/^.*\//, '') : '-';
  const script = r.script && r.script.path ? r.script.path.replace(/^.*\//, '') : '';
  return `${flag}0x${r.offset.toString(16)} ${String(r.name ?? '?')
    .slice(0, 30)
    .padEnd(
      30,
    )} ${r.position ? `(${r.position.map(v => v.toFixed(2)).join(', ')})`.padEnd(28) : '(no position)'.padEnd(28)} h${String(r.heading).padStart(5)} s${String(r.scale).padStart(5)} ${model.padEnd(32)} ${script.padEnd(28)} ${r.safety.safety}`;
}
