import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildArchive } from './helpers/synthetic.mjs';
import { syntheticLevel } from './helpers/synthetic-level.mjs';
import { levelCatalog, findLevel, capabilitiesOf, entryStatusFor } from '../src/editor/level-catalog.mjs';
import { openLevel } from '../src/editor/level-open.mjs';
import { entrySteps, redirectSteps } from '../src/editor/level-entry.mjs';
import { buildEditorPatch } from '../src/editor/patch-build.mjs';
import { openSession, applyEdit } from '../src/editor/session.mjs';
import { save, patch, launch, redirectFor } from '../src/editor/save.mjs';
import { runEditorGame } from '../src/editor/dolphin-run.mjs';
import { TUTORIAL_DISC, companionOf } from '../src/editor/levels.mjs';

// Feature 006, archive redirect: another level's archive and voice pack are served under the tutorial's file
// names, so the confirmed tutorial checkpoint makes the game load that level. Everything here is offline; the
// in-game answer is the boot, and until it exists the capability is UNKNOWN and labelled experimental.

const gates = { gates: () => ({ status: 'PASS' }) };

function machine({ companion = false } = {}) {
  const localDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-redirect-'));
  const level = syntheticLevel();
  const files = path.join(localDir, 'samples', 'DATA', 'files', 'level');
  fs.mkdirSync(files, { recursive: true });
  fs.writeFileSync(
    path.join(files, 'Level_000_Mining.bld'),
    buildArchive([{ name: 'level.bld', data: level.buf }]).buf,
  );
  if (companion) fs.writeFileSync(path.join(files, 'Level_000_Mining.arc'), Buffer.alloc(96, 3));
  const catalog = () => levelCatalog({ localDir, repoRoot: localDir, directEntry: () => true, configured: {} });
  return { localDir, level, files, catalog };
}

test('the voice pack is part of the catalogue and decides whether the redirect is offered', () => {
  const m = machine({ companion: true });
  const mining = findLevel(m.catalog(), 'Level_000_Mining');
  assert.equal(mining.companion.archive, 'level/Level_000_Mining.arc');
  assert.equal(mining.companion.present, true);
  assert.equal(mining.capabilities.direct_entry.available, true);
  assert.equal(mining.capabilities.direct_entry.experimental, true);
  assert.equal(mining.capabilities.direct_entry.confidence, 'UNKNOWN');
  assert.equal(mining.capabilities.direct_entry.finding, 'level.entry.archive-redirect');

  const bare = findLevel(machine().catalog(), 'Level_000_Mining');
  assert.equal(bare.companion.present, false);
  assert.equal(bare.capabilities.direct_entry.available, false);
  assert.match(bare.capabilities.direct_entry.why, /voice pack/);

  // Without the tutorial checkpoint there is nothing to redirect into.
  assert.equal(capabilitiesOf({ tutorial: false, directEntry: false, companion: true }).direct_entry.available, false);
  assert.equal(companionOf('level/Level_000_Mining.bld'), 'level/Level_000_Mining.arc');

  // The confidence is the level's row in the entry matrix: CONFIRMED and LIKELY drop the experimental label.
  const confirmed = capabilitiesOf({ tutorial: false, directEntry: true, companion: true, entryStatus: 'CONFIRMED' });
  assert.equal(confirmed.direct_entry.confidence, 'CONFIRMED');
  assert.equal(confirmed.direct_entry.experimental, undefined);
  assert.match(confirmed.direct_entry.why, /two identical boots/);
  assert.equal(confirmed.transform.confidence, 'CONFIRMED', 'a level booted with an edit has confirmed transforms');
  assert.equal(confirmed.transform.finding, 'level.transform.other-levels');
  assert.equal(capabilitiesOf({ tutorial: false, entryStatus: 'LIKELY' }).transform.confidence, 'LIKELY');
  const likely = capabilitiesOf({ tutorial: false, directEntry: true, companion: true, entryStatus: 'LIKELY' });
  assert.equal(likely.direct_entry.confidence, 'LIKELY');
  assert.match(likely.direct_entry.why, /not been booted/);
});

test('the entry matrix gives each level its status, the other families theirs, and nothing on an empty machine', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-entry-status-'));
  assert.equal(entryStatusFor('level/Level_000_Mining.bld', { repoRoot }), 'UNKNOWN', 'no matrix, no claim');
  fs.mkdirSync(path.join(repoRoot, 'docs'));
  fs.writeFileSync(
    path.join(repoRoot, 'docs', 'level-entry-status.json'),
    JSON.stringify({
      levels: [
        { archive: 'level/Level_027_Tutorial.bld', status: 'CONFIRMED' },
        { archive: 'level/Level_000_Mining.bld', status: 'CONFIRMED' },
        { level: 'Other level families', status: 'LIKELY' },
      ],
    }),
  );
  assert.equal(entryStatusFor('level/level_000_mining.BLD', { repoRoot }), 'CONFIRMED');
  assert.equal(entryStatusFor('level/Level_001_Castle.bld', { repoRoot }), 'LIKELY');
  fs.writeFileSync(
    path.join(repoRoot, 'docs', 'level-entry-status.json'),
    JSON.stringify({ levels: [{ level: 'x', status: 'MAYBE' }] }),
  );
  assert.equal(
    entryStatusFor('level/Level_001_Castle.bld', { repoRoot }),
    'UNKNOWN',
    'an unknown label is not a claim',
  );
});

test('opening extracts the voice pack when a game image is there, and says so when it is not', async () => {
  const m = machine();
  const calls = [];
  const extract = async (game, discPath, out) => {
    calls.push(discPath);
    const file = path.join(out, 'DATA', 'files', ...discPath.split('/'));
    fs.writeFileSync(file, Buffer.alloc(64, 9));
    return { file };
  };
  const s = await openLevel('Level_000_Mining', {
    catalog: m.catalog(),
    game: 'C:/game.wbfs',
    deps: { ...gates, extract },
  });
  assert.deepEqual(calls, ['level/Level_000_Mining.arc'], 'only the missing voice pack is extracted');
  assert.equal(s.level.companion.present, true);
  assert.deepEqual(s.level.redirect, { archive: TUTORIAL_DISC.archive, companion: TUTORIAL_DISC.companion });
  assert.equal(s.level.capabilities.direct_entry.available, true);

  const without = await openLevel('Level_000_Mining', { catalog: machine().catalog(), game: null, deps: gates });
  assert.equal(without.level.companion.present, false);
  assert.equal(without.level.capabilities.direct_entry.available, false);
  assert.equal(redirectFor(without), null);

  // A failing extractor leaves the level open, with the reason in the log.
  const logs = [];
  const failing = await openLevel('Level_000_Mining', {
    catalog: machine().catalog(),
    game: 'C:/game.wbfs',
    deps: {
      ...gates,
      extract: async () => {
        throw new Error('DolphinTool absent');
      },
    },
    log: l => logs.push(l),
  });
  assert.equal(failing.level.companion.present, false);
  assert.match(logs.join('\n'), /voice pack not extracted: DolphinTool absent/);
});

test('the redirect macro transitions, proves the tutorial-named archive was read, and only looks', () => {
  const steps = redirectSteps();
  assert.deepEqual(steps[0], { press: 'A', frames: 60 });
  assert.deepEqual(steps[1], { wait_monitor: TUTORIAL_DISC.archive, timeout: 240 });
  assert.ok(
    steps.every(s => !s.nunchuk && !s.figure && !s.save_state),
    'no movement, no figure, no state',
  );
  assert.equal(steps.filter(s => s.shot).length, 4);
  assert.equal(steps.at(-1).shot, 'redirect-arrived-3');
  assert.deepEqual(entrySteps(TUTORIAL_DISC.archive, { redirect: { level: 'level/Level_000_Mining.bld' } }), steps);
  assert.throws(() => entrySteps('level/Level_000_Mining.bld', { redirect: { level: 'x' } }), /not.*validated/i);
});

test('the patch builder writes a second descriptor with both files under the tutorial names', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-redirect-patch-'));
  const original = path.join(dir, 'Level_000_Mining.bld'),
    companion = path.join(dir, 'Level_000_Mining.arc'),
    file = path.join(dir, 'edited.decoded');
  fs.writeFileSync(original, buildArchive([{ name: 'level.bld', data: Buffer.from('IGZ original entry') }]).buf);
  fs.writeFileSync(companion, Buffer.alloc(128, 5));
  fs.writeFileSync(file, Buffer.from('IGZ modified entry'));
  const game = path.join(dir, 'test.wbfs');
  fs.writeFileSync(game, 'synthetic game path');
  const r = buildEditorPatch({
    experimentId: 'edit-mining',
    session: { entry: 0, archive: 'level/Level_000_Mining.bld' },
    replacements: [{ disc_path: 'level/Level_000_Mining.bld', file }],
    original,
    game,
    outDir: path.join(dir, 'patch'),
    redirect: {
      archive: TUTORIAL_DISC.archive,
      companion: TUTORIAL_DISC.companion,
      companion_file: companion,
      level: 'level/Level_000_Mining.bld',
    },
  });
  assert.equal(r.replacements[0].disc_path, 'level/Level_000_Mining.bld', 'the plain patch is unchanged');
  const x = r.redirect;
  assert.equal(x.level, 'level/Level_000_Mining.bld');
  assert.equal(x.entry_archive, TUTORIAL_DISC.archive);
  assert.deepEqual(
    x.replacements.map(q => q.disc_path),
    [TUTORIAL_DISC.archive, TUTORIAL_DISC.companion],
  );
  assert.equal(
    x.replacements[0].sha256,
    r.replacements[0].sha256,
    'the same rebuilt archive is served under the tutorial name',
  );
  assert.ok(x.dir.startsWith(r.dir), 'the redirect workspace lives inside the patch');
  const xml = fs.readFileSync(x.xml, 'utf8');
  assert.match(xml, /disc="\/level\/Level_027_Tutorial\.bld" external="\/files\/level\/Level_027_Tutorial\.bld"/);
  assert.match(xml, /disc="\/level\/Level_027_Tutorial\.arc" external="\/files\/level\/Level_027_Tutorial\.arc"/);
  assert.equal(x.expected_monitor_sizes[TUTORIAL_DISC.archive], r.expected_monitor_sizes['level/Level_000_Mining.bld']);
  assert.throws(
    () =>
      buildEditorPatch({
        experimentId: 'edit-mining-2',
        session: { entry: 0, archive: 'level/Level_000_Mining.bld' },
        replacements: [{ disc_path: 'level/Level_000_Mining.bld', file }],
        original,
        game,
        outDir: path.join(dir, 'patch2'),
        redirect: { archive: TUTORIAL_DISC.archive, companion: TUTORIAL_DISC.companion, companion_file: 'nope.arc' },
      }),
    /voice pack/,
  );
});

function miningSession({ companion = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-redirect-session-'));
  const file = path.join(dir, 'level.bld.decoded');
  fs.writeFileSync(file, syntheticLevel().buf);
  const s = openSession(file, { archive: 'level/Level_000_Mining.bld', entry: 3, deps: gates });
  s.level = {
    name: 'Level_000_Mining',
    tutorial: false,
    companion: { archive: 'level/Level_000_Mining.arc', file: path.join(dir, 'mining.arc'), present: companion },
    redirect: { archive: TUTORIAL_DISC.archive, companion: TUTORIAL_DISC.companion },
  };
  applyEdit(s, { kind: 'transform', target: s.placements[0].offset, heading: 90 });
  save(s, { out: path.join(dir, 'edited.decoded') });
  return { s, dir };
}

test('patch asks the builder for the redirect, and direct launch runs it under the tutorial names', async () => {
  const { s, dir } = miningSession();
  const built = [],
    runs = [];
  const deps = {
    build: args => {
      built.push(args.redirect);
      return {
        dir,
        replacements: [],
        redirect: { dir: path.join(dir, 'redirect'), replacements: [], entry_archive: TUTORIAL_DISC.archive },
      };
    },
    run: async args => {
      runs.push(args);
      return { id: 'redirect-run', consumption: { verified: true } };
    },
  };
  patch(s, { deps });
  assert.deepEqual(built, [
    {
      archive: TUTORIAL_DISC.archive,
      companion: TUTORIAL_DISC.companion,
      companion_file: s.level.companion.file,
      level: 'level/Level_000_Mining.bld',
    },
  ]);
  assert.equal(s.lastPatch.redirect.entry_archive, TUTORIAL_DISC.archive);

  await launch(s, { mode: 'direct-play', deps, wait: true });
  const run = runs.at(-1);
  assert.equal(run.archive, TUTORIAL_DISC.archive, 'the monitored archive is the tutorial name');
  assert.equal(run.patch.dir, path.join(dir, 'redirect'));
  assert.deepEqual(run.redirect, { level: 'level/Level_000_Mining.bld', name: 'Level_000_Mining' });
  assert.equal(s.lastLaunch.patch_dir, path.join(dir, 'redirect'));
  assert.deepEqual(s.lastLaunch.redirect, run.redirect);

  await launch(s, { mode: 'play', deps, wait: true });
  const plain = runs.at(-1);
  assert.equal(plain.archive, 'level/Level_000_Mining.bld', 'normal play serves the level under its own name');
  assert.equal(plain.redirect, null);
  assert.equal(plain.patch.dir, dir);
  assert.equal(s.locked, false);
});

test('direct launch on another level without a redirect patch is refused, with the reason', async () => {
  const { s, dir } = miningSession({ companion: false });
  const deps = { build: () => ({ dir, replacements: [] }), run: async () => ({ id: 'never' }) };
  patch(s, { deps });
  assert.equal(s.lastPatch.redirect, null);
  await assert.rejects(launch(s, { mode: 'direct-play', deps }), e => e.error === 'NO_REDIRECT_PATCH');
  await assert.rejects(launch(s, { mode: 'direct-test', deps }), e => e.error === 'NO_REDIRECT_PATCH');
  assert.equal(s.locked, false);
  await launch(s, { mode: 'play', deps, wait: true });
  assert.equal(s.lastLaunch.redirect, null);
});

test('a redirected run prepares the tutorial checkpoint, replays the redirect macro and proves consumption', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-redirect-run-')),
    figure = path.join(dir, 'figure.sky');
  fs.writeFileSync(figure, Buffer.alloc(16));
  const calls = [];
  const fake = {
    pid: 7,
    connect: async () => {},
    launch: async t => calls.push(['launch', t]),
    runScriptSafe: async (steps, opts) => {
      calls.push(['macro', steps]);
      opts.onStep?.({ step: 0 });
      return [];
    },
    loadFigure: async () => calls.push(['figure']),
    monitorLines: () => ['01:02 W[FileMon]: 12617 kB level/Level_027_Tutorial.bld'],
    stop: async () => {
      calls.push(['stop']);
      return { stopped: true };
    },
    close: async () => calls.push(['close']),
    json: async () => ({ pid: null }),
  };
  const prepared = [];
  const r = await runEditorGame({
    patch: {
      descriptor: 'redirect-launch.json',
      expected_monitor_sizes: { 'level/Level_027_Tutorial.bld': '12617 kB' },
      original_monitor_size: '15241 kB',
    },
    archive: TUTORIAL_DISC.archive,
    redirect: { level: 'level/Level_000_Mining.bld', name: 'Level_000_Mining' },
    mode: 'direct-test',
    figure,
    gameFactory: () => fake,
    evidenceDir: dir,
    entryServices: {
      confirmed: () => true,
      prepare: async args => {
        prepared.push(args.redirect);
        return { file: 'checkpoint' };
      },
      restore: async () => ({ proof: {}, restore: () => calls.push(['restore-slot']) }),
    },
  });
  assert.deepEqual(prepared, [{ level: 'level/Level_000_Mining.bld', name: 'Level_000_Mining' }]);
  const steps = calls.find(c => c[0] === 'macro')[1];
  assert.deepEqual(steps, redirectSteps());
  assert.equal(r.consumption.verified, true, 'the tutorial-named archive was read at the redirected size');
  assert.equal(r.redirect.level, 'level/Level_000_Mining.bld');
  assert.equal(r.status, 'MACRO_COMPLETED');
  assert.ok(calls.some(c => c[0] === 'restore-slot'));

  await assert.rejects(
    runEditorGame({
      patch: { descriptor: 'x', expected_monitor_sizes: {} },
      archive: TUTORIAL_DISC.archive,
      redirect: { level: 'level/Level_000_Mining.bld' },
      mode: 'play',
      figure,
      gameFactory: () => fake,
      evidenceDir: dir,
    }),
    /direct entry only/,
  );
});
