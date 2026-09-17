// Editor session: open a level, hold its placements, and refuse to open one it cannot vouch for (feature 003 T007).
//
// The session owns the bytes. Nothing else in the editor writes them, and the browser never sees them: it receives
// resolved records over the contract in specs/003-placement-editor-3d/contracts/editor-api.md.
//
// Opening refuses, rather than degrading, in three cases. The gates must report M1 and M2 as PASS, because the
// constitution forbids editor work before a rebuilt archive is known to load and a controlled mutation is known to
// work. A file with no detectable placement class is reported as such instead of showing an empty view that looks
// like a loading failure. And a resolved record that does not match the frozen placement contract is named rather
// than displayed, because a record the tool cannot vouch for is worse than no record.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildGraph } from '../igz/graph.mjs';
import { resolveAll } from '../igz/model-resolve.mjs';
import { schemaValidator, contracts002 } from '../workspace/manifest.mjs';
import { assessPlacement, worst, SEVERITY } from './safety.mjs';
import { gateStatus } from '../experiments/run-game.mjs';
import { scriptTable } from '../igz/script.mjs';
import { replacePlacement } from './placements.mjs';
import { translatedPathWords } from './trajectory.mjs';
import {
  applyAddition,
  transformAddition,
  restoreAddition,
  refreshAdditions,
  loadAdditionSidecar,
  assertAdditionDependencies,
} from './native-additions.mjs';

const UNLAYERED = '(unlayered)';
const WRAPPER_EMBED = 0x48;

// For each placement: the block a duplication would copy, and whether that block is a wrapper. A wrapper is
// simply whatever record sits 0x48 before the placement; its class is read, never assumed.
function copySizes(graph, rows) {
  const byOffset = new Map(graph.objects.map(o => [o.offset, o]));
  const out = new Map();
  for (const r of rows) {
    const w = byOffset.get(r.offset - WRAPPER_EMBED);
    out.set(
      r.offset,
      w ? { size: w.size, wrapped: true, wrapper: w.offset, wrapper_type: w.type } : { size: r.span, wrapped: false },
    );
  }
  return out;
}

// Two placements can stand in for each other when the same recipe applies and copies the same number of bytes.
export const interchangeable = (session, a, b) => {
  const x = session.copy?.get(a),
    y = session.copy?.get(b);
  return !!x && !!y && x.wrapped === y.wrapped && x.size === y.size;
};

const refuse = (message, exitCode = 2) => {
  const e = new Error(message);
  e.exitCode = exitCode;
  throw e;
};

// Layers as the view uses them: a name, how many placements claim it, and how those placements are graded, so a
// researcher can see where the risk of a level sits before opening a single object.
export function deriveLayers(placements, { hasRuntimeMap = false } = {}) {
  const byName = new Map();
  const add = (name, p) => {
    if (!byName.has(name)) byName.set(name, { name, count: 0, grades: Object.fromEntries(SEVERITY.map(s => [s, 0])) });
    const l = byName.get(name);
    l.count++;
    l.grades[worst(assessPlacement(p, { hasRuntimeMap }))]++;
  };
  for (const p of placements) {
    if (p.layers.length) for (const name of p.layers) add(name, p);
    else add(UNLAYERED, p);
  }
  return [...byName.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function openSession(file, { archive, entry, fixups = null, deps = {} } = {}) {
  const abs = path.resolve(file);
  const gates = deps.gates ?? gateStatus;
  const resolve = deps.resolve ?? resolveAll;

  for (const gate of ['m1', 'm2']) {
    const status = gates(gate)?.status;
    if (status !== 'PASS')
      refuse(
        `${gate.toUpperCase()} is ${status ?? 'UNKNOWN'}, not PASS: the constitution puts the archive round-trip and the controlled mutation before any editor work. Refusing to open ${abs}`,
      );
  }
  if (!fs.existsSync(abs)) refuse(`${abs} does not exist`, 3);

  const buf = fs.readFileSync(abs);
  let graph;
  try {
    graph = buildGraph(buf, { fields: false });
  } catch (e) {
    refuse(`${abs} is not a readable IGZ file: ${e.message}`);
  }

  const res = resolve(buf, graph, fixups);
  if (!res.file_has_placements || !res.rows.length)
    refuse(
      `${abs} carries no placement class: no header-table class holds records with a world position and a resolvable model, so this file has no placements to edit`,
    );

  const validate = schemaValidator('placement-v1.schema.json', contracts002);
  for (const row of res.rows) {
    if (validate(row)) continue;
    const why = (validate.errors ?? [])
      .slice(0, 2)
      .map(e => `${e.instancePath || '/'} ${e.message}`)
      .join('; ');
    refuse(
      `${abs}: the record at 0x${Number(row.offset ?? 0).toString(16)} does not match the placement-v1 contract (${why}). Refusing to present a record the tool cannot vouch for`,
    );
  }

  const hasRuntimeMap = !!fixups;
  const sec = graph.sections[graph.object_section];
  const session = {
    // Kept so the duplication path can hand the existing planners the shape they expect, on the working buffer.
    graph,
    sec,
    table: scriptTable(buf, graph),
    ptrSet: new Set(fixups?.pointer_words ?? []),
    copy: copySizes(graph, res.rows),
    id: 's_' + crypto.randomBytes(4).toString('hex'),
    file: abs,
    archive: archive ?? null,
    entry: entry ?? null,
    opened: new Date().toISOString(),
    original_sha256: sha256(buf),
    buffer: buf,
    placements: res.rows,
    layers: deriveLayers(res.rows, { hasRuntimeMap }),
    detection: {
      placement_type: res.classes.placement_type,
      model_type: res.classes.model_type,
      strict: res.detection?.chosen?.strict ?? 0,
      entries: res.detection?.chosen?.entries ?? 0,
      runner_up: res.detection?.runner_up?.strict ?? 0,
    },
    counts: {
      direct: res.counts.direct ?? 0,
      indirect: res.counts.indirect ?? 0,
      ambiguous: res.counts.ambiguous ?? 0,
      absent: res.counts.absent ?? 0,
    },
    models: res.models,
    has_runtime_map: hasRuntimeMap,
    fixups,
    edits: [],
    edit_revision: 0,
    undone: [],
    dirty: false,
    locked: false,
    lock: null,
    additions: [],
    next_addition_id: -1,
  };
  loadAdditionSidecar(session);
  session.layers = deriveLayers(session.placements, { hasRuntimeMap });
  return session;
}

// What `GET /api/session` returns: everything except the bytes and the placements.
export const sessionSummary = s => ({
  id: s.id,
  file: s.file,
  archive: s.archive,
  entry: s.entry,
  level: s.level ?? null,
  opened: s.opened,
  original_sha256: s.original_sha256,
  has_runtime_map: s.has_runtime_map,
  detection: s.detection,
  counts: s.counts,
  placement_count: s.placements.length,
  layer_count: s.layers.length,
  dirty: s.dirty,
  locked: s.locked,
  undo_depth: s.edits.length,
  redo_depth: s.undone.length,
  saved: s.lastSave ? { file: s.lastSave.file, sha256: s.lastSave.sha256 } : null,
  patched: s.lastPatch ?? null,
  launch_running: !!s.lastLaunch?.running,
});

export const findPlacement = (s, offset) => s.placements.find(p => p.offset === offset) ?? null;

// ---------------------------------------------------------------------------------------------------------
// Editing (feature 003 T028). An intent changes the working buffer and the record held in memory. Nothing here
// touches the file: `save` in save.mjs is the only place a file is produced, and it checks its own plan against
// the bytes before writing.

import { FIELDS } from '../igz/model-resolve.mjs';
import { modelMeshes } from './meshes.mjs';
import { sha256 } from '../util/hash.mjs';

const fail = (error, reason) => {
  const e = new Error(`${error}: ${reason}`);
  e.error = error;
  e.exitCode = 1;
  throw e;
};

// Which attributes this editor may write, and which evidence has to be there for it to be honest about them.
// Position, heading and scale are read at fixed offsets of the record, so the evidence that supports editing them
// is the layout evidence: if the record cannot say where the project's knowledge of that layout comes from, the
// editor does not write it.
const EDITABLE = { position: 'layout', heading: 'layout', scale: 'layout' };

export function canEdit(placement, attribute) {
  if (placement.native_addition && attribute === 'scale')
    return { ok: false, error: 'UNSUPPORTED_FIELD', reason: 'Added objects currently keep their original 100% scale.' };
  const key = EDITABLE[attribute];
  if (!key)
    return {
      ok: false,
      error: 'UNSUPPORTED_FIELD',
      reason: `${attribute} is not an attribute this editor writes; it writes ${Object.keys(EDITABLE).join(', ')}`,
    };
  const evidence = placement.evidence?.[key];
  if (!evidence || evidence === 'none')
    return {
      ok: false,
      error: 'EVIDENCE_MISSING',
      reason: `${attribute} rests on the ${key} evidence of this record, and this record carries none`,
    };
  return { ok: true, evidence };
}

const WRITERS = {
  position: (buf, offset, v) => {
    buf.writeFloatBE(v[0], offset + FIELDS.position);
    buf.writeFloatBE(v[1], offset + FIELDS.position + 4);
    buf.writeFloatBE(v[2], offset + FIELDS.position + 8);
  },
  heading: (buf, offset, v) => buf.writeFloatBE(v, offset + FIELDS.heading),
  scale: (buf, offset, v) => buf.writeFloatBE(v, offset + FIELDS.scale),
};
const READERS = {
  position: (buf, offset) => [0, 4, 8].map(d => round(buf.readFloatBE(offset + FIELDS.position + d))),
  heading: (buf, offset) => Math.round(buf.readFloatBE(offset + FIELDS.heading) * 10) / 10,
  scale: (buf, offset) => Math.round(buf.readFloatBE(offset + FIELDS.scale) * 10) / 10,
};
const round = v => Math.round(v * 1000) / 1000;

// The exact words an attribute occupies, copied out so undo can put them back unchanged. The displayed numbers
// are rounded for reading; restoring them instead of the bytes would rewrite the field with a nearby float.
const rawOf = (buf, offset, attribute) => {
  const words = wordsOf(offset, attribute);
  const out = Buffer.alloc(words.length * 4);
  words.forEach((w, i) => buf.copy(out, i * 4, w, w + 4));
  return out;
};
const putRaw = (buf, offset, attribute, raw) => {
  wordsOf(offset, attribute).forEach((w, i) => raw.copy(buf, w, i * 4, i * 4 + 4));
};

// The words an attribute occupies, so a save can tell an authorised change from any other.
const wordsOf = (offset, attribute) =>
  attribute === 'position'
    ? [offset + FIELDS.position, offset + FIELDS.position + 4, offset + FIELDS.position + 8]
    : [offset + FIELDS[attribute === 'heading' ? 'heading' : 'scale']];

function refreshRecord(session, placement) {
  placement.position = READERS.position(session.buffer, placement.offset);
  placement.rotation = { heading: READERS.heading(session.buffer, placement.offset) };
  placement.scale = READERS.scale(session.buffer, placement.offset);
  return placement;
}

export function applyEdit(session, intent) {
  if (session.locked) fail('SESSION_LOCKED', 'stop the editor-owned Dolphin before editing');
  assertAdditionDependencies(session, intent);
  if (intent.kind === 'add' || (intent.kind === 'transform' && intent.target < 0)) {
    const placement = intent.kind === 'add' ? applyAddition(session, intent) : transformAddition(session, intent);
    session.edit_revision = (session.edit_revision ?? 0) + 1;
    session.undone.length = 0;
    session.dirty = true;
    session.layers = deriveLayers(session.placements, { hasRuntimeMap: session.has_runtime_map });
    return { ...editResult(session, placement), rebuild_scene: true };
  }
  if (intent.kind === 'replace') return applyReplace(session, intent);
  if (intent.kind !== 'transform')
    fail('UNSUPPORTED_INTENT', `${intent.kind} is not a supported intent; this editor applies transform and replace`);
  const placement = findPlacement(session, intent.target);
  if (!placement) fail('NO_SUCH_PLACEMENT', `no placement at 0x${Number(intent.target).toString(16)} in this level`);

  const asked = Object.keys(EDITABLE).filter(k => intent[k] !== undefined && intent[k] !== null);
  const unknown = Object.keys(intent).filter(
    k => !['kind', 'target', 'acknowledged', ...Object.keys(EDITABLE)].includes(k),
  );
  if (unknown.length) fail('UNSUPPORTED_FIELD', `${unknown.join(', ')} is not an attribute this editor writes`);
  if (!asked.length) fail('NOTHING_TO_CHANGE', 'nothing to change: give a position, a heading or a scale');
  if (
    intent.position &&
    (!Array.isArray(intent.position) || intent.position.length !== 3 || intent.position.some(v => !Number.isFinite(v)))
  )
    fail('BAD_VALUE', 'a position needs three finite numbers');
  for (const k of asked) {
    const c = canEdit(placement, k);
    if (!c.ok) fail(c.error, c.reason);
  }
  const dependent_words = asked.includes('position') ? translatedPathWords(session, placement, intent.position) : [];

  const before = Object.fromEntries(asked.map(k => [k, READERS[k](session.buffer, placement.offset)]));
  const before_raw = Object.fromEntries(asked.map(k => [k, rawOf(session.buffer, placement.offset, k)]));
  for (const k of asked) WRITERS[k](session.buffer, placement.offset, intent[k]);
  const after = Object.fromEntries(asked.map(k => [k, READERS[k](session.buffer, placement.offset)]));
  const after_raw = Object.fromEntries(asked.map(k => [k, rawOf(session.buffer, placement.offset, k)]));
  writeWords(session.buffer, dependent_words, 'after');

  session.edits.push({
    kind: 'transform',
    target: placement.offset,
    attributes: asked,
    before,
    after,
    before_raw,
    after_raw,
    dependent_words,
    at: new Date().toISOString(),
  });
  session.edit_revision = (session.edit_revision ?? 0) + 1;
  session.undone.length = 0;
  refreshRecord(session, placement);
  session.dirty = true;
  return editResult(session, placement);
}

function applyRaw(session, offset, raws) {
  const placement = findPlacement(session, offset);
  for (const [k, raw] of Object.entries(raws)) putRaw(session.buffer, offset, k, raw);
  return refreshRecord(session, placement);
}

// ---------------------------------------------------------------------------------------------------------
// Duplication (feature 003 T044). It delegates to the planner that two boots have already confirmed, and adds
// only the refusals: this is the operation that consumes a slot and can retexture objects nobody asked about.

// The existing planners take a level of this shape. The buffer is the WORKING one, so a duplication sees the
// edits made before it.
const asLevel = session => ({
  file: session.file,
  buf: session.buffer,
  fixups: session.fixups,
  graph: session.graph,
  table: session.table,
  ptrSet: session.ptrSet,
  sec: session.sec,
});

// Every word two buffers differ in. Bounded and exact, which is what undo needs: a replacement rewrites a slot
// and bumps a refcount or two, and nothing else may move.
function wordDiff(before, after) {
  const words = [];
  const n = Math.min(before.length, after.length);
  for (let p = 0; p + 4 <= n; p += 4) {
    if (before.readUInt32BE(p) === after.readUInt32BE(p)) continue;
    words.push({ offset: p, before: before.readUInt32BE(p), after: after.readUInt32BE(p) });
  }
  return words;
}

const writeWords = (buf, words, side) => {
  for (const w of words) buf.writeUInt32BE(w[side], w.offset);
};

// Re-resolving is the honest way to refresh after a replacement: the slot now holds a different object, and
// guessing which of its attributes changed would be inventing knowledge the resolver already has.
function reresolve(session) {
  delete session._scriptDiagnostics;
  delete session._sceneRoles;
  delete session._meshes;
  const res = resolveAll(session.buffer, session.graph, session.fixups);
  session.placements = res.rows;
  refreshAdditions(session);
  session.layers = deriveLayers(session.placements, { hasRuntimeMap: session.has_runtime_map });
  session.models = res.models;
  session.counts = {
    direct: res.counts.direct ?? 0,
    indirect: res.counts.indirect ?? 0,
    ambiguous: res.counts.ambiguous ?? 0,
    absent: res.counts.absent ?? 0,
  };
}

// Prepare a duplication and report it, applying nothing. The view calls this first so the plan and every rule it
// triggers can be read before a confirmation exists; `applyReplace` then refuses anything not acknowledged.
export function planReplace(session, intent) {
  try {
    const dry = { ...intent, acknowledged: [] };
    const result = applyReplace(
      { ...session, edits: [], undone: [], buffer: Buffer.from(session.buffer), placements: session.placements },
      dry,
    );
    return { plan: result.plan, rules: result.plan.safety ?? [] };
  } catch (e) {
    if (e.plan)
      return {
        plan: e.plan,
        rules: e.rules ?? e.plan.safety ?? [],
        error: e.error === 'ACKNOWLEDGEMENT_REQUIRED' ? null : e.error,
        reason: e.message,
      };
    return { plan: null, rules: e.rules ?? [], error: e.error ?? 'REFUSED', reason: e.message };
  }
}

function applyReplace(session, intent) {
  const victim = findPlacement(session, intent.target);
  if (!victim) fail('NO_SUCH_PLACEMENT', `no placement at 0x${Number(intent.target).toString(16)} to replace`);
  const source = findPlacement(session, intent.source);
  if (!source) fail('NO_SUCH_PLACEMENT', `no placement at 0x${Number(intent.source).toString(16)} to copy from`);
  if (source.offset === victim.offset) fail('BAD_VALUE', 'a placement cannot be copied over itself');

  // A duplication WRITES pointer fields, so it needs to know which words are pointers. Structural resolution is
  // good enough to read a level; it is not evidence enough to rewrite one. Without a runtime fixup map the
  // editor refuses rather than guessing.
  if (!session.has_runtime_map)
    fail(
      'RUNTIME_MAP_REQUIRED',
      'this level has no runtime fixup map, so which words are pointers is structural only. Reading a level that way is fine; rewriting one is not. Produce a map with experiment ptr-scan before duplicating here',
    );
  // The block the recipe copies, not the distance between table entries: the confirmed pair differs on the second
  // and matches on the first.
  if (!interchangeable(session, source.offset, victim.offset)) {
    const a = session.copy?.get(source.offset),
      b = session.copy?.get(victim.offset);
    fail(
      'SPAN_MISMATCH',
      `the source copies a block of 0x${(a?.size ?? source.span).toString(16)} bytes${a?.wrapped ? ' (a wrapper)' : ''} and the target slot holds 0x${(b?.size ?? victim.span).toString(16)}${b?.wrapped ? ' (a wrapper)' : ''}; only a same-size replacement keeps the count-bounded walk aligned`,
    );
  }

  let r;
  try {
    r = replacePlacement(asLevel(session), source.offset, victim.offset, {
      position: intent.position ?? null,
      heading: intent.heading ?? null,
      scale: intent.scale ?? null,
      allowScripted: !!intent.allow_scripted,
    });
  } catch (e) {
    fail(e.error ?? 'PLAN_FAILED', e.message);
  }

  const plan = r.plan;
  if (plan.validation.status !== 'VALID') {
    const e = new Error('PLAN_INVALID: ' + plan.validation.failures.map(f => f.reason).join('; '));
    e.error = 'PLAN_INVALID';
    e.rules = plan.safety ?? [];
    e.plan = plan;
    e.exitCode = 1;
    throw e;
  }
  const acknowledged = new Set(intent.acknowledged ?? []);
  const unacknowledged = (plan.safety ?? []).filter(x => x.severity === 'critical' && !acknowledged.has(x.id));
  if (unacknowledged.length) {
    const e = new Error('ACKNOWLEDGEMENT_REQUIRED: ' + unacknowledged.map(x => x.message).join(' '));
    e.error = 'ACKNOWLEDGEMENT_REQUIRED';
    e.rules = unacknowledged;
    e.plan = plan;
    e.exitCode = 1;
    throw e;
  }

  const words = wordDiff(session.buffer, r.buffer);
  // Geometry is immutable under these recipes. Keep its original asset bindings before a shared
  // model record is renamed, otherwise ownership-by-offset would draw the victim's old geometry.
  session._meshLibrary ??= modelMeshes(session);
  writeWords(session.buffer, words, 'after');
  session.edits.push({
    kind: 'replace',
    target: victim.offset,
    source: source.offset,
    words,
    plan,
    summary: `${source.name} copied over ${victim.name}`,
    at: new Date().toISOString(),
  });
  session.edit_revision = (session.edit_revision ?? 0) + 1;
  session.undone.length = 0;
  reresolve(session);
  session.dirty = true;
  const placement = findPlacement(session, victim.offset);
  return { ...editResult(session, placement), plan, rebuild_scene: true };
}

export function undo(session) {
  if (session.locked) fail('SESSION_LOCKED', 'stop the editor-owned Dolphin before editing');
  const edit = session.edits.pop();
  if (!edit) return null;
  const placement = restore(session, edit, 'before');
  session.undone.push(edit);
  session.edit_revision = (session.edit_revision ?? 0) + 1;
  session.dirty = session.edits.length > 0;
  return { ...editResult(session, placement), rebuild_scene: edit.kind !== 'transform' };
}

// Replay the existing exact-byte undo records, including replacements and private paths.
// Keep the redo chain, and detach saved artefacts so Reset cannot launch an old patch.
export function resetScene(session) {
  if (session.locked || session.lastLaunch?.running)
    fail('SESSION_LOCKED', 'stop the editor-owned Dolphin before resetting the scene');
  const count = session.edits.length;
  while (session.edits.length) undo(session);
  session.edit_revision = (session.edit_revision ?? 0) + 1;
  session.dirty = false;
  session.lastSave = null;
  session.lastPatch = null;
  return { applied: count > 0, reset_scene: true, rebuild_scene: true, reset_count: count };
}

// A transform is restored field by field; a replacement is restored word by word, because the whole slot moved.
function restore(session, edit, side) {
  if (edit.kind === 'add' || edit.kind === 'add-transform') {
    const p = restoreAddition(session, edit, side);
    session.layers = deriveLayers(session.placements, { hasRuntimeMap: session.has_runtime_map });
    return p;
  }
  if (edit.kind === 'replace') {
    writeWords(session.buffer, edit.words, side);
    reresolve(session);
    return findPlacement(session, edit.target);
  }
  writeWords(session.buffer, edit.dependent_words ?? [], side);
  return applyRaw(session, edit.target, side === 'before' ? edit.before_raw : edit.after_raw);
}

export function redo(session) {
  if (session.locked) fail('SESSION_LOCKED', 'stop the editor-owned Dolphin before editing');
  const edit = session.undone.pop();
  if (!edit) return null;
  const placement = restore(session, edit, 'after');
  session.edits.push(edit);
  session.edit_revision = (session.edit_revision ?? 0) + 1;
  session.dirty = true;
  return { ...editResult(session, placement), rebuild_scene: edit.kind !== 'transform' };
}

const editResult = (session, placement) => ({
  applied: true,
  placement,
  safety: placement ? assessPlacement(placement, { hasRuntimeMap: session.has_runtime_map }) : [],
  dirty: session.dirty,
  undo_depth: session.edits.length,
  redo_depth: session.undone.length,
});

// Every word the accumulated edits are allowed to have changed. A save that touches anything else is refused.
export function authorisedWords(session) {
  const out = new Set();
  for (const e of session.edits) {
    if (e.kind === 'add' || e.kind === 'add-transform') continue;
    if (e.kind === 'replace') {
      for (const w of e.words) out.add(w.offset);
      continue;
    }
    for (const a of e.attributes) for (const w of wordsOf(e.target, a)) out.add(w);
    for (const w of e.dependent_words ?? []) out.add(w.offset);
  }
  return out;
}
