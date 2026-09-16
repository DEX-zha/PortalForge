// Save, patch, launch and observe (feature 003 T030 to T033).
//
// The chain is deliberately one-directional and each link refuses rather than degrades:
//   save   produces the plan BEFORE writing and checks it against the bytes it is about to write; if the plan is
//          not VALID nothing is produced, and the plan still carries every failure so the refusal can be read.
//   patch  builds a replacement-only workspace from the last valid save, never from the working buffer.
//   launch requires a prediction, because an experiment without one cannot be judged, and takes the session lock.
//   observe records what was actually seen and is what releases that lock, so a run cannot be quietly forgotten.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { authorisedWords } from './session.mjs';
import { FIELDS } from '../igz/model-resolve.mjs';
import { currentAdditionRecipe, additionsDigest, saveAdditionSidecar } from './native-additions.mjs';
import { compileNativePatch } from './native-patch.mjs';

const fail = (error, reason) => { const e = new Error(`${error}: ${reason}`); e.error = error; e.exitCode = 1; throw e; };
const hexAt = (buf, at) => buf.subarray(at, at + 4).toString('hex');
const hash = buf => crypto.createHash('sha256').update(buf).digest('hex');

// What this save changes, and what it must not. Built from the edit history, then checked word by word against
// the working buffer, so an unexplained byte is a refusal rather than a surprise in the game.
export function buildSavePlan(session) {
  const failures = [];
  let additions = [];
  try { additions = currentAdditionRecipe(session); }
  catch (e) { failures.push({ stage: 'additions', reason: e.message }); }
  const original = fs.existsSync(session.file) ? fs.readFileSync(session.file) : null;
  if (!original) failures.push({ stage: 'source', reason: `${session.file} is gone since the session opened` });
  else if (crypto.createHash('sha256').update(original).digest('hex') !== session.original_sha256) {
    failures.push({ stage: 'source', reason: `${session.file} changed since the session opened: its hash no longer matches, so this save would overwrite someone else's work` });
  }
  if (!session.edits.length && !additions.length) failures.push({ stage: 'edits', reason: 'nothing to save: no edit has been applied' });

  const allowed = authorisedWords(session);
  const changes = [];
  for (const e of session.edits) {
    if (e.kind === 'add' || e.kind === 'add-transform') continue;
    if (e.kind === 'replace') {
      for (const w of e.words) changes.push({ target: e.target, attribute: 'replace', field: `+0x${(w.offset - e.target).toString(16)}`,
        old: null, new: null, old_hex: original ? hexAt(original, w.offset) : null, new_hex: hexAt(session.buffer, w.offset) });
      continue;
    }
    for (const a of e.attributes) {
      const values = Array.isArray(e.after[a]) ? e.after[a] : [e.after[a]];
      const olds = Array.isArray(e.before[a]) ? e.before[a] : [e.before[a]];
      const words = [...allowedWordsFor(e.target, a)];
      words.forEach((w, i) => changes.push({ target: e.target, attribute: a, field: `+0x${(w - e.target).toString(16)}`,
        old: olds[i], new: values[i], old_hex: original ? hexAt(original, w) : null, new_hex: hexAt(session.buffer, w) }));
    }
    for (const w of e.dependent_words ?? []) changes.push({ target: e.target, attribute: 'trajectory', field: `+0x${(w.offset - e.target).toString(16)}`,
      old: original ? original.readFloatBE(w.offset) : null, new: session.buffer.readFloatBE(w.offset),
      old_hex: original ? hexAt(original, w.offset) : null, new_hex: hexAt(session.buffer, w.offset) });
  }

  let outside = 0;
  const lengthUnchanged = !!original && original.length === session.buffer.length;
  if (original && !lengthUnchanged) failures.push({ stage: 'validation', reason: 'the working buffer is not the same length as the file that was opened' });
  if (original && lengthUnchanged) {
    for (let p = 0; p + 4 <= original.length; p += 4) {
      if (original.readUInt32BE(p) === session.buffer.readUInt32BE(p)) continue;
      if (allowed.has(p)) continue;
      outside++;
      if (outside === 1) failures.push({ stage: 'validation', reason: `a word changed outside every edited attribute, at 0x${p.toString(16)}` });
    }
  }

  return {
    status: failures.length ? 'INVALID' : 'VALID',
    changes: dedupe(changes),
    native_additions: additions,
    failures,
    warnings: [],
    file_length_unchanged: lengthUnchanged,
    bytes_changed_outside: outside,
    edits: session.edits.length,
    source_sha256: session.original_sha256,
  };
}

// Later edits of the same attribute supersede earlier ones: the plan describes the net change, which is what the
// bytes will show.
function dedupe(changes) {
  const byField = new Map();
  for (const c of changes) {
    const key = `${c.target}:${c.field}`;
    if (byField.has(key)) { const first = byField.get(key); byField.set(key, { ...c, old: first.old, old_hex: first.old_hex }); }
    else byField.set(key, c);
  }
  return [...byField.values()].filter(c => c.old_hex !== c.new_hex);
}

// The words an attribute occupies, at the frozen offsets.
function* allowedWordsFor(offset, attribute) {
  if (attribute === 'position') { yield offset + FIELDS.position; yield offset + FIELDS.position + 4; yield offset + FIELDS.position + 8; }
  else yield offset + FIELDS[attribute];
}

export function save(session, { out = null } = {}) {
  if (session.locked) fail('SESSION_LOCKED', 'stop the editor-owned Dolphin before saving another patch');
  const plan = buildSavePlan(session);
  const target = path.resolve(out ?? session.file.replace(/(\.decoded)?$/, '.edited$1'));
  if (target.toLowerCase() === path.resolve(session.file).toLowerCase()) fail('SOURCE_OVERWRITE', 'save to a separate file to preserve the opened source');
  if (plan.status !== 'VALID') return { plan, written: null };

  // An output path that cannot be written is a refusal with a reason, not an internal error: the researcher
  // typed it, and a 500 tells them nothing about what to type instead.
  try { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, session.buffer); }
  catch (e) {
    plan.status = 'INVALID';
    plan.failures.push({ stage: 'write', reason: `${target} could not be written: ${e.code === 'ENOENT' ? 'the directory does not exist' : e.message}` });
    return { plan, written: null };
  }

  // The plan was made before the write; check the file that now exists against it rather than trusting the write.
  const written = fs.readFileSync(target);
  const original = fs.readFileSync(session.file);
  const allowed = authorisedWords(session);
  if (written.length !== original.length) { fs.rmSync(target, { force: true }); plan.status = 'INVALID'; plan.failures.push({ stage: 'written', reason: 'the written file is not the same length as the original' }); return { plan, written: null }; }
  for (let p = 0; p + 4 <= original.length; p += 4) {
    if (original.readUInt32BE(p) === written.readUInt32BE(p) || allowed.has(p)) continue;
    fs.rmSync(target, { force: true });
    plan.status = 'INVALID';
    plan.failures.push({ stage: 'written', reason: `the written file differs at 0x${p.toString(16)}, which the plan did not authorise` });
    return { plan, written: null };
  }

  const sha256 = hash(written);
  try { saveAdditionSidecar(session, target, sha256); }
  catch (e) { plan.status = 'INVALID'; plan.failures.push({ stage: 'addition-write', reason: e.message }); return { plan, written: null }; }
  session.dirty = false;
  session.lastPatch = null;
  session.lastSave = { file: target, plan, sha256, additions: plan.native_additions, additions_sha256: additionsDigest(plan.native_additions), at: new Date().toISOString() };
  return { plan, written: target };
}

export function patch(session, { deps = {} } = {}) {
  if (!session.lastSave) fail('NOTHING_SAVED', 'there is no valid save to build a patch from');
  if (session.locked) fail('SESSION_LOCKED', `a launched run may still be reading ${session.lock?.patch_dir}; record what you saw before rebuilding it`);
  if (hash(session.buffer) !== session.lastSave.sha256 || !fs.existsSync(session.lastSave.file) || hash(fs.readFileSync(session.lastSave.file)) !== session.lastSave.sha256) fail('UNSAVED_CHANGES', 'save the current edits before building their patch');
  if (additionsDigest(currentAdditionRecipe(session)) !== (session.lastSave.additions_sha256 ?? additionsDigest([]))) fail('UNSAVED_CHANGES', 'Save the current added objects before building their patch.');
  if (session.lastSave.additions_sha256) {
    let sidecar;
    try { sidecar = JSON.parse(fs.readFileSync(session.lastSave.file + '.portalforge.json', 'utf8')); } catch { fail('STALE_ADDITIONS', 'The saved addition file is missing or unreadable.'); }
    if (sidecar.base_sha256 !== session.lastSave.sha256 || additionsDigest(sidecar.additions) !== session.lastSave.additions_sha256) fail('STALE_ADDITIONS', 'The saved addition file changed. Save the scene again.');
  }
  const build = deps.build ?? defaultBuild;
  const experimentId = `edit-${path.basename(session.file, path.extname(session.file))}-${Date.now()}`;
  const result = build({
    experimentId,
    replacements: [{ disc_path: session.archive, file: session.lastSave.file }],
    entry: session.entry,
    session,
  });
  let native_additions = null;
  if (session.lastSave.additions?.length) {
    const recipe = compileNativePatch(session.lastSave.additions), file = path.join(result.dir, 'portalforge-additions.ini');
    fs.writeFileSync(file, recipe.ini);
    native_additions = { version: 1, file, sha256: hash(recipe.ini), additions: structuredClone(session.lastSave.additions) };
    fs.writeFileSync(path.join(result.dir, 'portalforge-additions.json'), JSON.stringify(native_additions, null, 2));
  }
  session.lastPatch = { ...result, dir: result.dir, replacements: result.replacements ?? [], experiment_id: experimentId,
    save_sha256: session.lastSave.sha256, additions_sha256: session.lastSave.additions_sha256, native_additions, rebuilt_sha256: result.rebuilt_sha256 ?? null, at: new Date().toISOString() };
  return { patch: session.lastPatch };
}

function defaultBuild() {
  fail('NOT_WIRED', 'the patch builder is supplied by the CLI layer; call patch() with deps.build');
}

// A launch is started, not awaited. Two boots take about ten minutes, far longer than any HTTP client will hold a
// response open, so the request returns as soon as the run is under way and the caller polls `launchState`.
// The lock is taken at the start, because the game begins reading the patch immediately.
export async function launch(session, { prediction = '', figure = null, repeat = 1, mode = null, deps = {}, wait = false } = {}) {
  if (mode !== null && !['test', 'play'].includes(mode)) fail('BAD_MODE', 'choose test or play');
  if (!mode && !String(prediction).trim()) fail('PREDICTION_REQUIRED', 'state what should be visible before the game starts: an experiment without a prediction cannot be judged');
  if (!session.lastPatch) fail('NOTHING_PATCHED', 'build a patch before launching');
  if (session.lastLaunch?.running) fail('ALREADY_RUNNING', 'a run is already under way; wait for it to finish');
  if (hash(session.buffer) !== session.lastPatch.save_sha256) fail('STALE_PATCH', 'the patch predates these edits: save and rebuild it first');
  if (additionsDigest(currentAdditionRecipe(session)) !== (session.lastPatch.additions_sha256 ?? additionsDigest([]))) fail('STALE_PATCH', 'Added objects changed: save and rebuild the patch first.');
  const native = session.lastPatch.native_additions;
  if (native && (!fs.existsSync(native.file) || hash(fs.readFileSync(native.file)) !== native.sha256 || additionsDigest(native.additions) !== session.lastPatch.additions_sha256)) fail('STALE_PATCH', 'The native addition patch changed after it was built.');
  for (const r of session.lastPatch.replacements) {
    if (r.sha256 && (!fs.existsSync(path.resolve(session.lastPatch.dir, r.file)) || hash(fs.readFileSync(path.resolve(session.lastPatch.dir, r.file))) !== r.sha256)) fail('STALE_PATCH', 'a replacement file changed after the patch was built');
  }
  prediction = String(prediction).trim() || session.lastSave.plan.changes.map(c => `0x${c.target.toString(16)} ${c.attribute} ${c.field}: ${c.old_hex} -> ${c.new_hex}`).join('; ') || 'Verify the saved level in game';
  const run = deps.run ?? (() => fail('NOT_WIRED', 'the experiment runner is supplied by the CLI layer; call launch() with deps.run'));

  session.lastLaunch = { experiment_id: null, prediction, figure, repeat, mode: mode ?? 'test',
    patch_dir: session.lastPatch.dir, observed: null, matched: null, running: true, error: null,
    started: new Date().toISOString(), at: new Date().toISOString() };
  session.lock = { patch_dir: session.lastPatch.dir, since: new Date().toISOString() };
  session.locked = true;
  const controller = new AbortController(), selectedPatch = session.lastPatch;
  const current = session.lastLaunch;
  current.controller = controller;

  const started = Promise.resolve()
    .then(() => run({ session, prediction, figure, repeat, mode: mode ?? 'test', patch: selectedPatch, signal: controller.signal,
      onProgress: progress => Object.assign(current, { progress }) }))
    .then(record => { current.experiment_id = record?.id ?? null; current.status = record?.status ?? null; current.consumption = record?.consumption ?? null; current.screenshots = record?.screenshots ?? []; return record; })
    .catch(e => { session.lastLaunch.error = e.message; return null; })
    .finally(() => { current.running = false; current.finished = new Date().toISOString(); if (mode) { session.locked = false; session.lock = null; } });
  session.lastLaunch.promise = started;

  if (wait) await started;
  return { launch: launchState(session).launch };
}

// The launch as the caller may see it: never the promise, and never a half-filled record dressed up as complete.
export function launchState(session) {
  const l = session.lastLaunch;
  if (!l) return { launch: null, locked: session.locked };
  const { promise, controller, ...rest } = l;
  return { launch: rest, locked: session.locked };
}

export function stopLaunch(session) {
  if (!session.lastLaunch?.running) fail('NOTHING_RUNNING', 'no editor-owned game is running');
  session.lastLaunch.controller.abort();
  return launchState(session);
}

export function observe(session, { experiment_id, observed, matched, deps = {} } = {}) {
  if (!session.lastLaunch) fail('NOTHING_LAUNCHED', 'no run to record an observation against');
  if (session.lastLaunch.running) fail('STILL_RUNNING', 'the run has not finished; there is nothing to have observed yet');
  if (experiment_id && experiment_id !== session.lastLaunch.experiment_id) fail('WRONG_EXPERIMENT', `this session launched ${session.lastLaunch.experiment_id}, not ${experiment_id}`);
  if (!String(observed ?? '').trim()) fail('OBSERVATION_REQUIRED', 'say what was actually seen, even when it is nothing');
  session.lastLaunch.observed = String(observed).trim();
  session.lastLaunch.matched = !!matched;
  if (deps.judge) session.lastLaunch.judged = deps.judge({ id: session.lastLaunch.experiment_id, observed: session.lastLaunch.observed, matched: !!matched });
  session.lock = null;
  session.locked = false;
  return { ...launchState(session), locked: false };
}
