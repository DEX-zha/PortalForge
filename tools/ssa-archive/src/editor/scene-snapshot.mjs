// The level as the running game holds it (feature 006): read from Dolphin, never computed.
//
// The editor cannot run the scripts, so what exists at a moment of play, what is still dormant, what was moved
// and what a script created is read from MEM1 while an editor-owned run is playing. A snapshot is a JSON file
// under .local/dolphin-evidence/scene-snapshots/<level>/, keyed by placement offset, and the view draws it as a
// read-only overlay: it is evidence about one moment of one run, LIKELY by construction, never a property of the
// file and never written back.
import fs from 'node:fs';
import path from 'node:path';
import { local } from '../experiments/run-game.mjs';
import { INSTANCE, INSTANCE_BYTES, PLACEMENT_CLASS } from './native-layout.mjs';
import { levelName } from './level-catalog.mjs';

export const SNAPSHOT_VERSION = 1;
// The +0x54 word of a constructed placement record, as read in Mining and the tutorial (igz.placement.inactive-flag).
export const STATE_LABELS = { 1: 'active', 2: 'dormant', 3: 'finished', 5: 'template' };
export const snapshotsDir = path.join(local, 'dolphin-evidence', 'scene-snapshots');

export const MEM1 = { start: 0x80000000, end: 0x81800000 };
const CHUNK = 0x10000;
const round3 = v => Math.round(v * 1000) / 1000;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Placed records whose stored position is unique in the level and away from the origin: what the search for the
// resident section anchors on. Two are needed, one to find and one to check.
export function anchorPlacements(session) {
  const key = p => p.position.map(v => Math.round(v * 1000)).join(',');
  const counts = new Map();
  for (const p of session.placements) counts.set(key(p), (counts.get(key(p)) ?? 0) + 1);
  return session.placements.filter(
    p =>
      !p.native_addition &&
      p.offset >= 0 &&
      counts.get(key(p)) === 1 &&
      p.position.some(v => Math.abs(v) > 1) &&
      (session.buffer.readUInt32BE(p.offset + 0x54) & 1) === 0,
  );
}
const storedTriple = (session, p) => session.buffer.subarray(p.offset + 0x24, p.offset + 0x30);

// Where the object section sits in MEM1. Floats are not rewritten by the loader, pointers are, so the anchor's
// stored position triple is searched for and the hit is checked against a second placement before it is trusted.
// The search starts where the two levels measured so far were loaded (0x80DBC020, 0x80DC6F48) and wraps.
export async function locateResidentSection(session, readBytes, { start = 0x80c00000 } = {}) {
  const [anchor, check] = anchorPlacements(session);
  if (!anchor || !check) throw new Error('no two placements with unique positions to anchor the search on');
  const pattern = storedTriple(session, anchor);
  const order = [];
  for (let at = start; at < MEM1.end; at += CHUNK - 16) order.push(at);
  for (let at = MEM1.start; at < start; at += CHUNK - 16) order.push(at);
  for (const at of order) {
    const buf = await readBytes(at, Math.min(CHUNK, MEM1.end - at));
    let i = buf.indexOf(pattern);
    while (i >= 0) {
      const base = at + i - (anchor.offset + 0x24);
      if (base >= MEM1.start) {
        const probe = await readBytes(base + check.offset + 0x24, 12);
        if (probe.equals(storedTriple(session, check))) return { base, anchor: anchor.name, check: check.name };
      }
      i = buf.indexOf(pattern, i + 1);
    }
  }
  throw new Error('the level section was not found in MEM1');
}

// The whole resident object section, read in bridge-sized chunks. A running game can change
// between chunks; this is an observation over the read interval, not an atomic snapshot.
export async function readResidentSection(session, base, readBytes) {
  const sec = session.graph.sections[session.graph.object_section];
  const size = sec.offset + sec.size;
  const out = Buffer.alloc(size);
  for (let at = 0; at < size; at += CHUNK) (await readBytes(base + at, Math.min(CHUNK, size - at))).copy(out, at);
  return out;
}

// One row per placement: its runtime state, whether it is constructed, its actor, and where it stands now
// against where the file stores it.
export function placementStates(session, resident) {
  const rows = [];
  for (const p of session.placements) {
    if (p.native_addition || p.offset < 0 || p.offset + INSTANCE_BYTES > resident.length) continue;
    const head = resident.subarray(p.offset, p.offset + INSTANCE_BYTES);
    const state = head.readUInt32BE(INSTANCE.state);
    const stored = [0, 4, 8].map(k => head.readFloatBE(INSTANCE.position + k));
    const current = [0, 4, 8].map(k => head.readFloatBE(INSTANCE.current_position + k));
    rows.push({
      offset: p.offset,
      name: p.name,
      state,
      label: STATE_LABELS[state] ?? `state-${state}`,
      constructed: head.readUInt32BE(0) === PLACEMENT_CLASS,
      actor: head.readUInt32BE(INSTANCE.actor) >>> 0,
      position: stored.map(round3),
      current: current.map(round3),
      heading: Math.round(head.readFloatBE(INSTANCE.current_heading) * 10) / 10,
      moved: round3(dist(current, stored)),
    });
  }
  return rows;
}

// Placement instances the game created at run time: the clones its scripts made and the native additions.
// They carry the same class pointer as the file's records but live outside the resident section, so a scan of
// MEM1 for that word finds them. Which record they were cloned from is told by the model and script they point
// at, both inside the resident section (the rule scene-roles uses to pair a template with its placed twin).
export async function scanCreatedInstances(session, base, readBytes, { placements = null } = {}) {
  const sec = session.graph.sections[session.graph.object_section];
  const residentEnd = base + sec.offset + sec.size;
  const hits = [];
  const word = Buffer.alloc(4);
  word.writeUInt32BE(PLACEMENT_CLASS);
  for (let at = MEM1.start; at < MEM1.end; at += CHUNK) {
    const buf = await readBytes(at, Math.min(CHUNK, MEM1.end - at));
    let i = buf.indexOf(word);
    while (i >= 0) {
      const address = at + i;
      if (i % 4 === 0 && (address < base || address >= residentEnd)) hits.push(address);
      i = buf.indexOf(word, i + 4);
    }
  }
  const byModel = new Map(),
    byOffset = new Map(session.placements.map(p => [p.offset, p]));
  for (const p of session.placements)
    if (p.model?.offset != null) byModel.set(p.model.offset, [...(byModel.get(p.model.offset) ?? []), p]);
  const resident = v => (v >= base && v < residentEnd ? v - base : null);
  const states = new Map((placements ?? []).map(r => [r.offset, r]));
  const created = [];
  for (const address of hits) {
    let head;
    try {
      head = await readBytes(address, INSTANCE_BYTES);
    } catch {
      continue;
    }
    const model = resident(head.readUInt32BE(INSTANCE.model) >>> 0);
    const script = resident(head.readUInt32BE(INSTANCE.script) >>> 0);
    const parent = resident(head.readUInt32BE(INSTANCE.parent) >>> 0);
    const candidates = (model !== null ? byModel.get(model) : null) ?? [];
    const template =
      candidates.find(p => (p.behavior?.offset ?? null) === script) ?? (candidates.length === 1 ? candidates[0] : null);
    const state = head.readUInt32BE(INSTANCE.state);
    const current = [0, 4, 8].map(k => head.readFloatBE(INSTANCE.current_position + k));
    // The class word also occurs inside structures that are not instances: only a sane state and either a
    // template pairing or a live actor away from the origin make a hit an instance (Mining: 276 hits, 11 clones).
    const actor = head.readUInt32BE(INSTANCE.actor) !== 0;
    if (!STATE_LABELS[state] || !current.every(Number.isFinite)) continue;
    if (!template && !(actor && current.some(v => Math.abs(v) > 1))) continue;
    created.push({
      address: '0x' + address.toString(16),
      state,
      label: STATE_LABELS[state],
      actor,
      position: [0, 4, 8].map(k => round3(head.readFloatBE(INSTANCE.position + k))),
      current: current.map(round3),
      heading: Math.round(head.readFloatBE(INSTANCE.current_heading) * 10) / 10,
      model_offset: model,
      script_offset: script,
      template: template
        ? { offset: template.offset, name: template.name, label: states.get(template.offset)?.label ?? null }
        : null,
      parent: parent !== null && byOffset.has(parent) ? { offset: parent, name: byOffset.get(parent).name } : null,
      model: candidates[0]?.model?.path?.replace(/^.*\//, '') ?? null,
    });
  }
  return created;
}

export async function captureSceneSnapshot(
  session,
  { readBytes, run = null, moment = null, actors = null, created = true } = {},
) {
  const located = await locateResidentSection(session, readBytes);
  const resident = await readResidentSection(session, located.base, readBytes);
  const placements = placementStates(session, resident);
  const counts = {};
  for (const r of placements) counts[r.label] = (counts[r.label] ?? 0) + 1;
  if (created && !actors) actors = await scanCreatedInstances(session, located.base, readBytes, { placements });
  return {
    version: SNAPSHOT_VERSION,
    archive: session.archive,
    level: session.level?.name ?? levelName(session.archive),
    original_sha256: session.original_sha256,
    run,
    moment,
    taken: new Date().toISOString(),
    base: located.base,
    anchor: located.anchor,
    counts,
    moved: placements.filter(r => r.moved > 0.5).length,
    placements,
    actors,
    confidence: 'LIKELY',
    editable: false,
  };
}

export function saveSnapshot(snapshot, { dir = snapshotsDir } = {}) {
  const folder = path.join(dir, levelName(snapshot.archive).toLowerCase());
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `${snapshot.taken.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
  return file;
}

// The newest snapshot of a level, or null. Its placements are keyed by offset for the view.
export function latestSnapshotFile(archive, { dir = snapshotsDir } = {}) {
  const folder = path.join(dir, levelName(archive).toLowerCase());
  try {
    const newest = fs
      .readdirSync(folder)
      .filter(f => f.endsWith('.json'))
      .sort()
      .at(-1);
    return newest ? path.join(folder, newest) : null;
  } catch {
    return null;
  }
}

export function latestSnapshot(archive, { dir = snapshotsDir } = {}) {
  const file = latestSnapshotFile(archive, { dir });
  if (!file) return null;
  try {
    return { file, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return null;
  }
}

// What the view needs: states and current positions by offset, the actors, and where it all comes from.
export function snapshotSummary(snapshot, session = null) {
  if (!snapshot) return null;
  return {
    file: snapshot.file ?? null,
    run: snapshot.run,
    moment: snapshot.moment,
    taken: snapshot.taken,
    counts: snapshot.counts,
    moved: snapshot.moved,
    same_bytes: session ? snapshot.original_sha256 === session.original_sha256 : null,
    states: Object.fromEntries(
      snapshot.placements.map(r => [
        r.offset,
        { state: r.state, label: r.label, current: r.current, heading: r.heading, moved: r.moved, actor: !!r.actor },
      ]),
    ),
    // Created instances the view can draw: those paired with a template that has a model, at their current
    // position. The +0x5C pointer of a clone names its template again, not its creator, so no creator is claimed.
    actors: (snapshot.actors ?? [])
      .filter(a => a.template && a.model)
      .map(a => ({
        address: a.address,
        label: a.label,
        actor: a.actor,
        template: a.template.name,
        resource_offset: a.template.offset,
        position: a.current,
        heading: a.heading,
      })),
    created: snapshot.actors?.length ?? 0,
    confidence: snapshot.confidence,
  };
}

// Helpers for the actor research (research-probes/actor-probe.mjs): the words of a dump that look like MEM1
// pointers, and where a float triple appears in a buffer.
export function pointerWords(buf, from = 0, to = buf.length) {
  const out = [];
  for (let at = from; at + 4 <= to; at += 4) {
    const v = buf.readUInt32BE(at) >>> 0;
    if (v >= MEM1.start && v < MEM1.end) out.push({ offset: at, value: v });
  }
  return out;
}
export function findTriple(buf, triple, tolerance = 0.002) {
  const hits = [];
  for (let at = 0; at + 12 <= buf.length; at += 4) {
    if (
      Math.abs(buf.readFloatBE(at) - triple[0]) <= tolerance &&
      Math.abs(buf.readFloatBE(at + 4) - triple[1]) <= tolerance &&
      Math.abs(buf.readFloatBE(at + 8) - triple[2]) <= tolerance
    )
      hits.push(at);
  }
  return hits;
}
