// Placement and model resolution across levels (spec 002).
//
// For every placement of an IGZ level this answers: where is it, which .mdl does it show, is that model record
// shared with other placements, and how much of that is actually evidenced.
//
// Why nothing here is keyed on a type index or a class name:
//   - Type INDICES are per file. The placement class is index 104 in the tutorial, 95 / 97 / 98 in the three
//     other levels of the sample disc, 57 in a character archive.
//   - Type NAMES are not trustworthy either. `parseTypes` splits section 0 on NUL, and the name range is broken
//     up by 12-byte block records, so the index/name alignment drifts (1 358 of the tutorial's 2 858 table
//     entries resolve to an empty name). The parsed name is kept as a LABEL only, never as a key.
// The placement class is therefore DETECTED structurally in each file, from the record layout itself, and the
// detector is calibrated on the one level where the answer is known at runtime (the tutorial has a fixup map
// from `experiment ptr-scan`, so there we know which words the game actually rewrote as pointers).
//
// Placement layout (finding igz.placement.type104-record, boot-confirmed on the tutorial):
//   +0x08 name (section-2 string)   +0x24/+0x28/+0x2C position   +0x34 heading (deg)   +0xB8 scale (100 = 1.0)
//   +0xA8 -> behaviour script       +0xDC -> model record whose +0x08 names the .mdl
//
// Model resolution ladder:
//   direct     +0xDC resolves to a model record                      the normal case
//   indirect   +0xDC does not, exactly one other field does          reported with its offset
//   ambiguous  several distinct model records reachable, none at +0xDC
//   absent     no model record reachable                             marker, camera, sound, trigger volume
import { scriptTable } from './script.mjs';

export const FIELDS = { name: 0x08, position: 0x24, heading: 0x34, scale: 0xb8, behavior: 0xa8, model: 0xdc };
export const MODEL_FIELD = FIELDS.model;
const ASSET_PATH = /\.(mdl|lvl)$/i;
const ASSET_DIR = /(^|\/)(models|levels)\//i;
const MIN_SPAN = FIELDS.model + 4;

export function levelContext(buf, graph, fixups = null) {
  const sec = graph.sections[graph.object_section];
  const s2 = graph.sections[2] ?? null;
  const table = scriptTable(buf, graph);
  const spans = new Map();
  for (let i = 0; i < table.length; i++) spans.set(table[i], (table[i + 1] ?? sec.offset + sec.size) - table[i]);
  const ctx = {
    buf,
    graph,
    sec,
    s2,
    table,
    spans,
    ptrSet: fixups ? new Set(fixups.pointer_words) : null,
    fixups,
    placementType: null,
    modelType: null,
    detection: null,
  };
  return ctx;
}

export const typeLabel = (ctx, t) => ctx.graph.types?.[t]?.name || null;

export function stringAt(ctx, value) {
  if (!ctx.s2 || value >>> 24 !== 1) return null;
  const off = value & 0xffffff;
  if (off >= ctx.s2.size) return null;
  const p = ctx.s2.offset + off;
  const end = ctx.buf.indexOf(0, p);
  return ctx.buf.toString('latin1', p, end < 0 ? Math.min(p + 200, ctx.buf.length) : Math.min(end, p + 400));
}

// A word is a candidate section-1 pointer when it lands, 4-aligned, inside the object section.
function targetOf(ctx, value) {
  const off = value & 0x7fffffff;
  if (off % 4 !== 0 || off === 0 || off >= ctx.sec.size) return null;
  return ctx.sec.offset + off;
}

const worldFloat = v => Number.isFinite(v) && Math.abs(v) < 1e4;

// An asset record: any record whose +0x08 string is an asset path. The class index is NOT constrained here,
// because it differs per file; `detectClasses` then reports which class the file actually uses.
function assetAt(ctx, offset) {
  if (offset === null || offset + 12 > ctx.buf.length) return null;
  const path = stringAt(ctx, ctx.buf.readUInt32BE(offset + 8));
  if (!path || !(ASSET_PATH.test(path) || ASSET_DIR.test(path))) return null;
  return { offset, path, type: ctx.buf.readUInt32BE(offset), refcount: ctx.buf.readUInt32BE(offset + 4) };
}

// Model record: an asset record of the file's dominant model class (set by detectClasses).
function modelAt(ctx, offset) {
  const a = assetAt(ctx, offset);
  if (!a) return null;
  if (ctx.modelType !== null && a.type !== ctx.modelType) return null;
  return a;
}

// Signature of a placement, used only to DETECT the class; it must not depend on the class itself.
//   strict: carries a world position and a resolvable model  -> the placement is certainly one
//   weak:   named, scale 100, heading in [-360, 360], span large enough -> consistent with a placement
export function signature(ctx, off) {
  const span = ctx.spans.get(off) ?? 0;
  if (span < MIN_SPAN) return { weak: false, strict: false };
  const x = ctx.buf.readFloatBE(off + FIELDS.position),
    y = ctx.buf.readFloatBE(off + FIELDS.position + 4),
    z = ctx.buf.readFloatBE(off + FIELDS.position + 8);
  const named = !!(stringAt(ctx, ctx.buf.readUInt32BE(off + FIELDS.name)) ?? '').match(/[A-Za-z]{2}/);
  const scale = ctx.buf.readFloatBE(off + FIELDS.scale),
    heading = ctx.buf.readFloatBE(off + FIELDS.heading);
  const weak = named && Math.abs(scale - 100) < 0.01 && Number.isFinite(heading) && heading >= -360 && heading <= 360;
  const positioned = worldFloat(x) && worldFloat(y) && worldFloat(z) && !(x === 0 && y === 0 && z === 0);
  const asset = assetAt(ctx, targetOf(ctx, ctx.buf.readUInt32BE(off + FIELDS.model)));
  return { weak, strict: weak && positioned && !!asset, assetType: asset ? asset.type : null };
}

// Detect, for this file, the class index that holds placements and the class index of the model records they
// point at. Returns every candidate so the choice is auditable, never a bare answer.
export function detectClasses(ctx, { minStrict = 3, minRate = 0.25 } = {}) {
  const byType = new Map();
  for (const e of ctx.table) {
    const t = ctx.buf.readUInt32BE(e);
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(e);
  }
  const candidates = [];
  for (const [type, entries] of byType) {
    let strict = 0,
      weak = 0;
    const assetTypes = new Map();
    for (const e of entries) {
      const s = signature(ctx, e);
      if (s.weak) weak++;
      if (s.strict) {
        strict++;
        assetTypes.set(s.assetType, (assetTypes.get(s.assetType) ?? 0) + 1);
      }
    }
    if (!strict) continue;
    const dominant = [...assetTypes.entries()].sort((a, b) => b[1] - a[1])[0];
    candidates.push({
      type,
      label: typeLabel(ctx, type),
      entries: entries.length,
      strict,
      weak,
      strict_rate: strict / entries.length,
      weak_rate: weak / entries.length,
      model_type: dominant[0],
      model_share: dominant[1] / strict,
    });
  }
  candidates.sort((a, b) => b.strict - a.strict);
  const best = candidates[0];
  const chosen = best && best.strict >= minStrict && best.strict_rate >= minRate ? best : null;
  ctx.placementType = chosen ? chosen.type : null;
  ctx.modelType = chosen ? chosen.model_type : null;
  ctx.detection = {
    chosen,
    candidates: candidates.slice(0, 5),
    runner_up: candidates[1] ?? null,
    margin: candidates.length > 1 ? best.strict / Math.max(1, candidates[1].strict) : Infinity,
  };
  return ctx.detection;
}

export function placements(ctx) {
  if (ctx.placementType === null) return [];
  return ctx.table.filter(e => ctx.buf.readUInt32BE(e) === ctx.placementType);
}

export function resolveModel(ctx, offset) {
  const span = ctx.spans.get(offset) ?? 0;
  const direct = modelAt(ctx, targetOf(ctx, ctx.buf.readUInt32BE(offset + FIELDS.model)));
  if (direct)
    return { status: 'direct', field: FIELDS.model, model: direct, candidates: [{ ...direct, field: FIELDS.model }] };
  const found = new Map();
  for (let q = 12; q + 4 <= span; q += 4) {
    if (q === FIELDS.model) continue;
    const m = modelAt(ctx, targetOf(ctx, ctx.buf.readUInt32BE(offset + q)));
    if (m && !found.has(m.offset)) found.set(m.offset, { ...m, field: q });
  }
  const candidates = [...found.values()];
  if (candidates.length === 1)
    return { status: 'indirect', field: candidates[0].field, model: candidates[0], candidates };
  if (candidates.length > 1) return { status: 'ambiguous', field: null, model: null, candidates };
  return { status: 'absent', field: null, model: null, candidates: [] };
}

// Which header-table record physically contains an offset. A model record normally lives inside some
// placement's blob, so replacing that blob rewrites the model for every other user of it.
export function ownerOf(ctx, offset) {
  let owner = null;
  for (const e of ctx.table) {
    if (e <= offset) owner = e;
    else break;
  }
  if (owner === null) return null;
  const span = ctx.spans.get(owner) ?? 0;
  return offset < owner + span
    ? { offset: owner, type: ctx.buf.readUInt32BE(owner), span, inside: offset > owner }
    : null;
}

// One pass over the object section collecting every word that resolves to one of the given offsets.
// 68% of the words that resolve to a placement in the tutorial are real pointers, so the raw index is not
// usable as such; the layer rule below is what makes it precise.
export function placementReferrers(ctx, offsets) {
  const want = new Set(offsets);
  const refs = new Map();
  const base = ctx.sec.offset,
    end = base + ctx.sec.size;
  for (let p = base; p + 4 <= end; p += 4) {
    const v = ctx.buf.readUInt32BE(p);
    const off = v & 0x7fffffff;
    if (off % 4 !== 0 || off === 0 || off >= ctx.sec.size) continue;
    const t = base + off;
    if (!want.has(t)) continue;
    if (!refs.has(t)) refs.set(t, []);
    refs.get(t).push(p);
  }
  return refs;
}

// A LAYER is a named header-table record that references the placement: "Plants", "Loot", "OpeningCS",
// "Level_027_plants.lvl". The rule excludes the placement's own blob, other placements, and records named by
// an .ai or .mdl path (those are the behaviour script and the model, not a grouping).
// Measured on the tutorial against the runtime fixup map: the rule keeps 1170 words, 100.00% of which are
// runtime pointers, and it reproduces every layer label the fixup-based implementation reported (1077/1077),
// plus 93 referrers that implementation dropped through a hardcoded class whitelist.
export function layersOf(ctx, offset, refs) {
  const out = new Set();
  for (const w of refs.get(offset) ?? []) {
    const o = ownerOf(ctx, w);
    if (!o || o.offset === offset) continue;
    if (ctx.placementType !== null && ctx.buf.readUInt32BE(o.offset) === ctx.placementType) continue;
    const nm = stringAt(ctx, ctx.buf.readUInt32BE(o.offset + 8));
    if (!nm || !/[A-Za-z]{2}/.test(nm) || /.(ai|mdl)$/i.test(nm)) continue;
    out.add(nm);
  }
  return [...out];
}

// The stable placement record. Every attribute carries where its value comes from.
function describePlacement(ctx, offset, resolved, layers = []) {
  const buf = ctx.buf;
  const behaviorTarget = targetOf(ctx, buf.readUInt32BE(offset + FIELDS.behavior));
  const behavior =
    behaviorTarget !== null && behaviorTarget + 12 <= buf.length
      ? {
          offset: behaviorTarget,
          type: buf.readUInt32BE(behaviorTarget),
          path: stringAt(ctx, buf.readUInt32BE(behaviorTarget + 8)),
        }
      : null;
  const runtime = ctx.ptrSet;
  return {
    model_version: 1,
    offset,
    span: ctx.spans.get(offset) ?? 0,
    name: stringAt(ctx, buf.readUInt32BE(offset + FIELDS.name)),
    position: [0, 4, 8].map(d => Math.round(buf.readFloatBE(offset + FIELDS.position + d) * 1000) / 1000),
    rotation: { heading: Math.round(buf.readFloatBE(offset + FIELDS.heading) * 10) / 10 },
    scale: Math.round(buf.readFloatBE(offset + FIELDS.scale) * 10) / 10,
    behavior: behavior && behavior.path ? { offset: behavior.offset, path: behavior.path } : null,
    model: resolved.model
      ? { offset: resolved.model.offset, path: resolved.model.path, field: resolved.field, status: resolved.status }
      : { offset: null, path: null, field: null, status: resolved.status },
    model_candidates: resolved.candidates.map(c => ({
      offset: c.offset,
      path: c.path,
      field: c.field ?? FIELDS.model,
    })),
    layers,
    evidence: {
      layout: 'igz.placement.type104-record (CONFIRMED on Level_027_Tutorial by two boots; structural elsewhere)',
      model: resolved.model
        ? runtime
          ? runtime.has(offset + resolved.field)
            ? 'runtime-pointer'
            : 'structural-only'
          : 'structural'
        : 'none',
      behavior:
        behavior && behavior.path
          ? runtime
            ? runtime.has(offset + FIELDS.behavior)
              ? 'runtime-pointer'
              : 'structural-only'
            : 'structural'
          : 'none',
      layers: layers.length ? (runtime ? 'runtime-pointer' : 'structural') : 'none',
    },
  };
}

export function resolveAll(buf, graph, fixups = null, { detect = true, placementType = null } = {}) {
  const ctx = levelContext(buf, graph, fixups);
  const detection = detect ? detectClasses(ctx) : null;
  if (placementType !== null) {
    ctx.placementType = placementType;
  }
  const list = placements(ctx);
  const refs = placementReferrers(ctx, list);
  const rows = [];
  for (const p of list) {
    const r = resolveModel(ctx, p);
    const d = describePlacement(ctx, p, r, layersOf(ctx, p, refs));
    d.status = r.status;
    rows.push(d);
  }
  const users = new Map();
  for (const r of rows)
    if (r.model.offset !== null) {
      if (!users.has(r.model.offset)) users.set(r.model.offset, []);
      users.get(r.model.offset).push(r.offset);
    }
  const models = [...users.entries()]
    .map(([offset, list]) => {
      const owner = ownerOf(ctx, offset);
      return {
        offset,
        path: assetAt(ctx, offset)?.path ?? null,
        users: list,
        user_count: list.length,
        owner: owner ? { offset: owner.offset, type: owner.type, inside_blob: owner.inside } : null,
        shared: list.length > 1,
        rewritten_by_replacing: owner && owner.inside ? owner.offset : null,
      };
    })
    .sort((a, b) => b.user_count - a.user_count);
  const byOffset = new Map(models.map(m => [m.offset, m]));
  for (const r of rows)
    r.shared_state =
      r.model.offset !== null
        ? {
            model_record: r.model.offset,
            users: byOffset.get(r.model.offset).user_count,
            shared: byOffset.get(r.model.offset).shared,
            rewritten_by_replacing: byOffset.get(r.model.offset).rewritten_by_replacing,
          }
        : null;
  const counts = rows.reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
  return {
    placements: rows.length,
    counts,
    rows,
    models,
    detection,
    shared_models: models.filter(m => m.shared).length,
    models_inside_a_placement: models.filter(m => m.owner?.inside_blob).length,
    file_has_placements: ctx.placementType !== null,
    classes: {
      placement_type: ctx.placementType,
      placement_label: ctx.placementType !== null ? typeLabel(ctx, ctx.placementType) : null,
      model_type: ctx.modelType,
      model_label: ctx.modelType !== null ? typeLabel(ctx, ctx.modelType) : null,
    },
  };
}

// Ground truth: on a level with a runtime fixup map, does the structural resolver pick exactly the words the
// game rewrote as pointers? The structural answer is trusted on other levels only because it reproduces this.
export function validateAgainstFixups(buf, graph, fixups) {
  const res = resolveAll(buf, graph, fixups);
  const ctx = levelContext(buf, graph, fixups);
  detectClasses(ctx);
  const rows = res.rows.map(r => {
    const field = r.model.field ?? FIELDS.model;
    const runtimePointer = ctx.ptrSet.has(r.offset + field);
    const runtimeTarget = runtimePointer ? targetOf(ctx, buf.readUInt32BE(r.offset + field)) : null;
    const structural = r.model.offset;
    const agree =
      structural !== null
        ? runtimePointer && runtimeTarget === structural
        : !(runtimePointer && modelAt(ctx, runtimeTarget));
    return {
      offset: r.offset,
      name: r.name,
      status: r.status,
      field,
      agree,
      runtime_pointer: runtimePointer,
      runtime_target: runtimeTarget,
      structural_target: structural,
    };
  });
  const agreed = rows.filter(r => r.agree).length;
  return {
    total: rows.length,
    agreed,
    agreement: rows.length ? agreed / rows.length : 1,
    false_positives: rows.filter(r => r.structural_target !== null && !r.runtime_pointer),
    missed: rows.filter(r => r.structural_target === null && r.runtime_pointer && modelAt(ctx, r.runtime_target)),
    rows,
  };
}

export function formatResolve(res, { limit = 20 } = {}) {
  if (!res.file_has_placements)
    return 'no placement class detected in this file (no header-table class carries a world position plus a resolvable model)';
  const d = res.detection?.chosen;
  const lines = [
    `placement class: type ${res.classes.placement_type} (parsed label ${res.classes.placement_label ? '"' + res.classes.placement_label + '"' : 'none — the name table is unreliable'}), detected on ${d ? `${d.strict}/${d.entries} entries carrying a position and a model` : 'n/a'}${res.detection?.runner_up ? `; runner-up type ${res.detection.runner_up.type} with ${res.detection.runner_up.strict}` : '; no other candidate'}`,
    `model class: type ${res.classes.model_type} (label ${res.classes.model_label ? '"' + res.classes.model_label + '"' : 'none'})`,
    `placements ${res.placements}: ` +
      Object.entries(res.counts)
        .map(([k, v]) => `${k} ${v}`)
        .join(', '),
    `model records ${res.models.length}: ${res.shared_models} shared by more than one placement, ${res.models_inside_a_placement} physically inside another placement's blob`,
  ];
  for (const m of res.models.slice(0, limit))
    lines.push(
      `  0x${m.offset.toString(16)} ${String(m.path ?? '?')
        .replace(/^.*\//, '')
        .padEnd(
          36,
        )} used by ${String(m.user_count).padStart(3)}${m.rewritten_by_replacing !== null ? `  [inside 0x${m.rewritten_by_replacing.toString(16)}]` : ''}`,
    );
  if (res.models.length > limit) lines.push(`  ... ${res.models.length - limit} more model records`);
  return lines.join('\n');
}
