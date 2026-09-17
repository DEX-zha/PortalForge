import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { syntheticLevel } from './helpers/synthetic-level.mjs';
import { openSession, applyEdit } from '../src/editor/session.mjs';
import { save, patch, launch } from '../src/editor/save.mjs';
import { additionSource, additionCompileOptions, loadAdditionSidecar } from '../src/editor/native-additions.mjs';
import { compileNativePatch } from '../src/editor/native-patch.mjs';
import { classifyAddition, familyKey } from '../src/editor/addition-compatibility.mjs';
import { judgeRun, fileLaunchReports } from '../src/editor/addition-reports.mjs';
import { saveSnapshot } from '../src/editor/scene-snapshot.mjs';

// Feature 007, "add anything": the evidence no longer gates an addition. Any resident object of a level whose
// place in memory is known can be added; an addition without its own confirmed recipe is experimental, says so
// everywhere it goes, and earns its evidence from the launches that carry it.

const sha = text => createHash('sha256').update(text).digest('hex');
const gates = { gates: () => ({ status: 'PASS' }) };

function tutorial(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-anything-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'level.decoded');
  fs.writeFileSync(file, syntheticLevel().buf);
  const s = openSession(file, { archive: 'level/Level_027_Tutorial.bld', entry: 3, deps: gates });
  // The first crate stands in for the confirmed sunflower recipe; the others have no recipe of their own.
  const confirmed = s.placements[0];
  confirmed.offset = 3446244;
  confirmed.model.path = 'models/plant_sunflower_whole.mdl';
  confirmed.model.offset = 3446580;
  const [, barrel, camera] = s.placements;
  barrel.behavior = { offset: 0x2a00, path: 'Scripts/Barrel.ai' };
  return { s, dir, confirmed, barrel, camera };
}

test('a source is confirmed or experimental, and only what cannot work is unavailable', t => {
  const { s, confirmed, barrel, camera } = tutorial(t);
  assert.equal(additionSource(s, confirmed.offset).evidence, 'confirmed');
  assert.equal(additionSource(s, barrel.offset).evidence, 'experimental');
  assert.equal(additionSource(s, camera.offset).evidence, 'experimental', 'an object with nothing to draw too');
  assert.match(additionSource(s, 7).reason, /no longer exists/);

  const copy = applyEdit(s, { kind: 'add', source: barrel.offset, position: [1, 2, 3] }).placement;
  assert.match(additionSource(s, copy.offset).reason, /original object/);

  // Every object of the level is addable, and no card calls an experimental source confirmed.
  const originals = s.placements.filter(p => !p.native_addition);
  const verdicts = originals.map(p => classifyAddition(s, p));
  assert.ok(verdicts.every(v => v.available));
  assert.deepEqual(
    verdicts.map(v => v.status === 'confirmed'),
    originals.map(p => p.offset === confirmed.offset),
  );
  assert.deepEqual(
    verdicts.map(v => v.experimental),
    originals.map(p => p.offset !== confirmed.offset),
  );
});

test('experimental additions are marked, created from the activation manager, and survive save and reopen', t => {
  const { s, dir, confirmed, barrel, camera } = tutorial(t);
  applyEdit(s, { kind: 'add', source: confirmed.offset, position: [91, 10, 43] });
  applyEdit(s, { kind: 'add', source: barrel.offset, position: [92, 10, 43] });
  applyEdit(s, { kind: 'add', source: camera.offset, position: [93, 10, 43] });
  const [plain, scripted, invisible] = s.additions;
  assert.equal(plain.experimental, undefined, 'a confirmed recipe stays exactly what it was');
  assert.deepEqual([scripted.experimental, scripted.script], [true, 0x2a00]);
  assert.deepEqual([invisible.experimental, invisible.model, invisible.script], [true, null, undefined]);
  assert.match(s.placements.find(p => p.offset === scripted.id).evidence.layout, /experimental addition/);
  assert.match(s.placements.find(p => p.offset === plain.id).evidence.layout, /CONFIRMED/);

  const options = additionCompileOptions(s, s.additions);
  assert.equal(options.layout, 'slot');
  const compiled = compileNativePatch(s.additions, options);
  assert.deepEqual(
    compiled.hooks.map(h => h.address),
    [0x800445c8, 0x80062b88],
    'the confirmed script-less copy keeps its validated hook; the experimental ones go through activation',
  );
  // The script-less experimental source is in the activation batch, not with the confirmed one.
  assert.deepEqual(
    compiled.hooks.map(h => h.words.filter(w => w === 0x50464e41).length),
    [1, 2],
  );

  const out = path.join(dir, 'edited.decoded');
  assert.ok(save(s, { out }).written);
  const sidecar = JSON.parse(fs.readFileSync(out + '.portalforge.json', 'utf8'));
  assert.deepEqual(
    sidecar.additions.map(a => !!a.experimental),
    [false, true, true],
  );
  // The additions saved with a level do not change its bytes, so a fresh session of the same level reads them.
  const reopened = tutorial(t).s;
  reopened.file = out;
  loadAdditionSidecar(reopened);
  assert.deepEqual(reopened.additions, s.additions);

  // A sidecar that claims a confirmed recipe for a source that has none is refused.
  delete sidecar.additions[1].experimental;
  fs.writeFileSync(out + '.portalforge.json', JSON.stringify(sidecar));
  const again = tutorial(t).s;
  again.file = out;
  assert.throws(() => loadAdditionSidecar(again), /evidence behind an addition changed/);
});

test('a scene past the proven slot layout compiles as the compact table, and says so in its patch', t => {
  const { s, dir, barrel } = tutorial(t);
  for (let i = 0; i < 19; i++) applyEdit(s, { kind: 'add', source: barrel.offset, position: [90 + i, 10, 43] });
  const options = additionCompileOptions(s, s.additions);
  assert.equal(options.layout, 'table');
  assert.ok(save(s, { out: path.join(dir, 'many.decoded') }).written);
  patch(s, { deps: { build: () => ({ dir, replacements: [] }) } });
  const native = s.lastPatch.native_additions;
  assert.equal(native.options.layout, 'table');
  assert.equal(native.additions.length, 19);
  assert.equal(sha(compileNativePatch(native.additions, native.options).ini), native.sha256);
});

test('every launch files what the game said, and the card shows it without ever blocking', async t => {
  const { s, dir, barrel } = tutorial(t);
  applyEdit(s, { kind: 'add', source: barrel.offset, position: [92, 10, 43] });
  assert.ok(save(s, { out: path.join(dir, 'edited.decoded') }).written);
  const reportsDir = path.join(dir, 'reports');
  const outcomes = ['passed', 'passed', 'failed'];
  const deps = {
    reportsDir,
    build: () => ({ dir, replacements: [] }),
    run: async args => ({
      id: 'run-' + outcomes.length,
      status: 'MACRO_COMPLETED',
      consumption: { verified: true },
      native_samples: [
        {
          capture: null,
          rows: args.patch.native_additions.additions.map(a => ({
            id: a.id,
            source: a.source,
            runtime: outcomes[0],
            reason: outcomes[0] === 'passed' ? 'Distinct native instance.' : 'Source guards have not passed yet.',
          })),
        },
      ],
    }),
  };
  patch(s, { deps });
  const family = familyKey(s, barrel);
  const report = () => JSON.parse(fs.readFileSync(path.join(reportsDir, family + '.json'), 'utf8'));

  await launch(s, { mode: 'test', deps, wait: true });
  assert.deepEqual(s.lastLaunch.additions, [
    { id: -1, source: barrel.offset, runtime: 'passed', reason: 'Distinct native instance.' },
  ]);
  assert.equal(report().runtime, 'passed');
  assert.equal(report().passed_launches, 1);

  outcomes.shift();
  await launch(s, { mode: 'test', deps, wait: true });
  let verdict = classifyAddition(s, barrel, { report: report() });
  assert.equal(verdict.status, 'runtime_passed');
  assert.match(verdict.reason, /2 launch/);
  assert.equal(verdict.available, true);

  outcomes.shift();
  await launch(s, { mode: 'test', deps, wait: true });
  verdict = classifyAddition(s, barrel, { report: report() });
  assert.equal(verdict.status, 'test_failed');
  assert.match(verdict.reason, /guards have not passed/);
  assert.equal(verdict.available, true, 'the failure is shown; adding again is still allowed');
  assert.deepEqual(
    report().launches.map(l => l.runtime),
    ['passed', 'passed', 'failed'],
  );
});

test('several additions of one family count as one verdict, the worst, and a vanished pickup is inconclusive', t => {
  const { s, dir, barrel } = tutorial(t);
  const additions = [
    { id: -1, source: barrel.offset },
    { id: -2, source: barrel.offset },
  ];
  const row = (id, runtime) => ({ id, source: barrel.offset, runtime, reason: runtime });
  const results = judgeRun(additions, [
    { capture: 'arrived', rows: [row(-1, 'passed'), row(-2, 'passed')] },
    { capture: null, rows: [row(-1, 'passed'), row(-2, 'inconclusive')] },
  ]);
  assert.deepEqual(
    results.map(r => r.runtime),
    ['passed', 'observed'],
  );
  const [report] = fileLaunchReports(s, results, { run: 'r1', dir: path.join(dir, 'reports') });
  assert.equal(report.runtime, 'inconclusive');
  assert.equal(report.launches[0].additions, 2);
  assert.match(report.reason, /collected or destroyed/);
});

test('another level needs only its scene snapshot to make everything addable', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-anything-mining-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'level.decoded');
  fs.writeFileSync(file, syntheticLevel().buf);
  const s = openSession(file, { archive: 'level/Level_000_Mining.bld', entry: 3, deps: gates });
  s.snapshots_dir = path.join(dir, 'snapshots');
  const [crate, barrel] = s.placements;
  assert.throws(
    () => applyEdit(s, { kind: 'add', source: crate.offset, position: [0, 0, 0] }),
    e => e.error === 'ADDITION_SOURCE_UNAVAILABLE' && /scene snapshot/.test(e.message),
  );
  saveSnapshot(
    {
      version: 1,
      archive: s.archive,
      original_sha256: s.original_sha256,
      taken: '2026-09-17T19:00:00.000Z',
      base: 0x80d00000,
      placements: [{ offset: barrel.offset, state: 1, actor: 0x81000200, moved: 0 }],
      actors: [],
    },
    { dir: s.snapshots_dir },
  );
  const added = applyEdit(s, { kind: 'add', source: crate.offset, position: [4, 5, 6] }).placement;
  assert.equal(added.native_addition.source, crate.offset);
  assert.equal(s.additions[0].experimental, true);
  const options = additionCompileOptions(s, s.additions);
  assert.deepEqual([options.base, options.context], [0x80d00000, 'activation']);
});
