import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syntheticLevel } from './helpers/synthetic-level.mjs';
import { openSession, applyEdit } from '../src/editor/session.mjs';
import { buildSavePlan, save, patch, launch, observe, launchState } from '../src/editor/save.mjs';

// Feature 003 T026 and T027. The save is the only place a file is produced, and it produces one only when the
// plan it made beforehand matches the bytes it is about to write. Patch and launch sit behind that, and behind
// the session lock, so a running game is never read out from under.

function session() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-save-'));
  const file = path.join(dir, 'level.bld.decoded');
  fs.writeFileSync(file, syntheticLevel().buf);
  const s = openSession(file, { archive: 'level/Test.bld', entry: 3, deps: { gates: () => ({ status: 'PASS' }) } });
  s.outDir = dir;
  return s;
}
const out = s => path.join(s.outDir, 'edited.bld.decoded');

test('save: a valid plan reports what changed, changes nothing else, and keeps the file length', () => {
  const s = session();
  const target = s.placements[0].offset;
  applyEdit(s, { kind: 'transform', target, position: [40, 5, -12], heading: 210, scale: 150 });
  const plan = buildSavePlan(s);
  assert.equal(plan.status, 'VALID');
  assert.equal(plan.file_length_unchanged, true);
  assert.equal(plan.bytes_changed_outside, 0);
  assert.deepEqual(plan.failures, []);
  assert.equal(plan.changes.length, 5, 'three position words, a heading and a scale');
  for (const c of plan.changes) { assert.equal(c.target, target); assert.match(c.field, /^\+0x/); assert.notEqual(c.old_hex, c.new_hex); }

  const r = save(s, { out: out(s) });
  assert.equal(r.plan.status, 'VALID');
  assert.equal(r.written, out(s));
  const before = fs.readFileSync(s.file), after = fs.readFileSync(out(s));
  assert.equal(before.length, after.length);
  let differing = 0;
  for (let p = 0; p + 4 <= before.length; p += 4) if (before.readUInt32BE(p) !== after.readUInt32BE(p)) differing++;
  assert.equal(differing, 5, 'exactly the five edited words differ');
  assert.equal(s.dirty, false, 'a successful save clears the dirty flag');
});

test('save: an invalid plan writes nothing and returns every failure', () => {
  const s = session();
  applyEdit(s, { kind: 'transform', target: s.placements[0].offset, position: [1, 2, 3] });
  s.buffer.writeUInt32BE(0xdeadbeef, s.buffer.length - 8);          // a change the plan never authorised
  const r = save(s, { out: out(s) });
  assert.equal(r.plan.status, 'INVALID');
  assert.equal(r.written, null);
  assert.ok(r.plan.bytes_changed_outside > 0);
  assert.ok(r.plan.failures.some(f => /outside/i.test(f.reason)));
  assert.equal(fs.existsSync(out(s)), false, 'nothing was produced');
});

test('save: a file that changed under the session since it opened is refused', () => {
  const s = session();
  applyEdit(s, { kind: 'transform', target: s.placements[0].offset, heading: 12 });
  fs.appendFileSync(s.file, Buffer.from([0]));                       // someone else touched it
  const r = save(s, { out: out(s) });
  assert.equal(r.plan.status, 'INVALID');
  assert.ok(r.plan.failures.some(f => /changed since|no longer matches/i.test(f.reason)));
  assert.equal(r.written, null);
});

test('save: saving with nothing to save is refused rather than writing a copy', () => {
  const s = session();
  const r = save(s, { out: out(s) });
  assert.equal(r.plan.status, 'INVALID');
  assert.ok(r.plan.failures.some(f => /nothing/i.test(f.reason)));
  assert.equal(fs.existsSync(out(s)), false);
});

test('patch: refuses before any valid save, and refuses while the session lock is held', () => {
  const s = session();
  assert.throws(() => patch(s, { deps: { build: () => ({ dir: 'x' }) } }), e => e.error === 'NOTHING_SAVED');

  applyEdit(s, { kind: 'transform', target: s.placements[0].offset, heading: 90 });
  save(s, { out: out(s) });
  const built = [];
  const deps = { build: args => { built.push(args); return { dir: path.join(s.outDir, 'patch'), replacements: [{ disc_path: s.archive, file: out(s) }] }; } };
  const p = patch(s, { deps });
  assert.equal(built.length, 1);
  assert.equal(built[0].replacements[0].disc_path, 'level/Test.bld');
  assert.match(p.patch.dir, /patch$/);

  s.lock = { patch_dir: p.patch.dir, since: new Date().toISOString() };
  s.locked = true;
  assert.throws(() => patch(s, { deps }), e => e.error === 'SESSION_LOCKED');
  assert.equal(built.length, 1, 'and it did not rebuild behind the lock');
});

test('launch: refuses without a prediction, takes the lock, and an observation releases it', async () => {
  const s = session();
  applyEdit(s, { kind: 'transform', target: s.placements[0].offset, heading: 90 });
  save(s, { out: out(s) });
  const deps = { build: () => ({ dir: path.join(s.outDir, 'patch'), replacements: [] }), run: async () => ({ id: 'exp_1', status: 'UNKNOWN' }) };
  patch(s, { deps });

  await assert.rejects(launch(s, { prediction: '   ', deps }), e => e.error === 'PREDICTION_REQUIRED');
  await assert.rejects(launch(s, { deps }), e => e.error === 'PREDICTION_REQUIRED');
  assert.equal(s.locked, false, 'a refused launch takes no lock');

  // The launch RETURNS as soon as the run is under way: two boots take about ten minutes, far longer than any
  // client will hold a response open. The id only exists once the runner has produced its record.
  const r = await launch(s, { prediction: 'the crate stands eight units further along x', deps });
  assert.equal(r.launch.running, true, 'the call returns while the game is still starting');
  assert.equal(r.launch.experiment_id, null, 'the id is not known yet, and is not invented');
  assert.equal(r.launch.prediction, 'the crate stands eight units further along x');
  assert.equal(s.locked, true, 'the lock is taken at once: the game reads the patch immediately');
  assert.throws(() => observe(s, { observed: 'too early' }), e => e.error === 'STILL_RUNNING');

  await s.lastLaunch.promise;
  assert.equal(launchState(s).launch.running, false);
  assert.equal(launchState(s).launch.experiment_id, 'exp_1');
  assert.equal(launchState(s).launch.promise, undefined, 'the promise never leaves the module');

  const o = observe(s, { experiment_id: 'exp_1', observed: 'it did', matched: true, deps: { judge: () => ({ status: 'UNKNOWN' }) } });
  assert.equal(o.launch.observed, 'it did');
  assert.equal(o.launch.matched, true);
  assert.equal(o.locked, false, 'recording what was seen is what releases the lock');
});
