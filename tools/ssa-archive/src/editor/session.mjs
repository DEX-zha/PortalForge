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

const UNLAYERED = '(unlayered)';

const refuse = (message, exitCode = 2) => { const e = new Error(message); e.exitCode = exitCode; throw e; };

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
    if (status !== 'PASS') refuse(`${gate.toUpperCase()} is ${status ?? 'UNKNOWN'}, not PASS: the constitution puts the archive round-trip and the controlled mutation before any editor work. Refusing to open ${abs}`);
  }
  if (!fs.existsSync(abs)) refuse(`${abs} does not exist`, 3);

  const buf = fs.readFileSync(abs);
  let graph;
  try { graph = buildGraph(buf, { fields: false }); }
  catch (e) { refuse(`${abs} is not a readable IGZ file: ${e.message}`); }

  const res = resolve(buf, graph, fixups);
  if (!res.file_has_placements || !res.rows.length) refuse(`${abs} carries no placement class: no header-table class holds records with a world position and a resolvable model, so this file has no placements to edit`);

  const validate = schemaValidator('placement-v1.schema.json', contracts002);
  for (const row of res.rows) {
    if (validate(row)) continue;
    const why = (validate.errors ?? []).slice(0, 2).map(e => `${e.instancePath || '/'} ${e.message}`).join('; ');
    refuse(`${abs}: the record at 0x${Number(row.offset ?? 0).toString(16)} does not match the placement-v1 contract (${why}). Refusing to present a record the tool cannot vouch for`);
  }

  const hasRuntimeMap = !!fixups;
  return {
    id: 's_' + crypto.randomBytes(4).toString('hex'),
    file: abs,
    archive: archive ?? null,
    entry: entry ?? null,
    opened: new Date().toISOString(),
    original_sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    buffer: buf,
    placements: res.rows,
    layers: deriveLayers(res.rows, { hasRuntimeMap }),
    detection: { placement_type: res.classes.placement_type, model_type: res.classes.model_type,
      strict: res.detection?.chosen?.strict ?? 0, entries: res.detection?.chosen?.entries ?? 0,
      runner_up: res.detection?.runner_up?.strict ?? 0 },
    counts: { direct: res.counts.direct ?? 0, indirect: res.counts.indirect ?? 0, ambiguous: res.counts.ambiguous ?? 0, absent: res.counts.absent ?? 0 },
    models: res.models,
    has_runtime_map: hasRuntimeMap,
    fixups,
    edits: [],
    undone: [],
    dirty: false,
    locked: false,
    lock: null,
  };
}

// What `GET /api/session` returns: everything except the bytes and the placements.
export const sessionSummary = s => ({
  id: s.id, file: s.file, archive: s.archive, entry: s.entry, opened: s.opened,
  original_sha256: s.original_sha256, has_runtime_map: s.has_runtime_map,
  detection: s.detection, counts: s.counts, placement_count: s.placements.length,
  layer_count: s.layers.length, dirty: s.dirty, locked: s.locked, undo_depth: s.edits.length,
});

export const findPlacement = (s, offset) => s.placements.find(p => p.offset === offset) ?? null;
