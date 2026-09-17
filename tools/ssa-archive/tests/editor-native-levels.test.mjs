import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { syntheticLevel } from './helpers/synthetic-level.mjs';
import { openSession } from '../src/editor/session.mjs';
import {
  compileNativePatch,
  nativeCapacity,
  nativeOptions,
  NATIVE_BASE,
  NATIVE_LIMIT,
  NATIVE_STRIDE,
  TUTORIAL_ANCHOR,
  GECKO_CODE_BUDGET,
  TABLE,
  TABLE_STRIDE,
} from '../src/editor/native-patch.mjs';
import { locateAdditionRows, verifyNativeInstances } from '../src/editor/native-run.mjs';
import { GECKO_AREA, INSTANCE, INSTANCE_BYTES, PLACEMENT_CLASS, SLOT } from '../src/editor/native-layout.mjs';
import { chooseAnchor, nativeParamsFor } from '../src/editor/native-params.mjs';
import { saveSnapshot } from '../src/editor/scene-snapshot.mjs';
import { classifyAddition } from '../src/editor/addition-compatibility.mjs';
import { batchAdditions, campaignSources, judgeRun, runLevelBatch } from '../src/editor/addition-campaign.mjs';

// Feature 007, phase A: the native recipe on every level. What is level-specific became data (the resident base,
// the readiness anchor), the tutorial's output must not move by a byte, and a compact layout raises the count a
// patch can hold. Nothing here boots a game; the in-game proof is a separate, recorded experiment.

const sha = text => createHash('sha256').update(text).digest('hex');
const recipes = JSON.parse(fs.readFileSync(new URL('../src/editor/native-recipes.json', import.meta.url), 'utf8'));
const gates = { gates: () => ({ status: 'PASS' }) };

const recipeAddition = (recipe, i) => ({
  id: -i - 1,
  source: recipe.source,
  model: 0x1000 + i * 0x40,
  position: [90 + i * 1.5, 10.25, 40 - i * 0.75],
  heading: 12.5 * i,
  scale: 100,
  ...(recipe.script ? { script: recipe.script.offset } : {}),
});
const plain = recipes.filter(r => !r.script);
const scripted = recipes.filter(r => r.script);
const batch = (pool, n) => Array.from({ length: n }, (_, i) => recipeAddition(pool[i % pool.length], i));

test('the tutorial recipe compiles to the bytes recorded before it took level parameters', () => {
  // Recorded from the boot-proven compiler of feature 005, on these exact inputs, before any change.
  const recorded = {
    one_plain: ['6c6f7e5997732f989eec1a83d690652fd2e1ff472a41a8200911fc07c0e74df8', 712],
    one_scripted: ['56ccba5192bb0dca6a7b96857efd13cb4f3e19c3e56494e7b4d873df2abec707', 768],
    eight_plain: ['034efa8aa02ee2a28aaf70a0589f03a3740aaa32a2dd71f4f7db067c96f78278', 1720],
    eight_scripted: ['d7135f2231a7616e6ae79bd00cd0341ff2a11c1f74cd5997f2149a0b6e5ba24c', 1776],
    eight_mixed: ['e0d4a7cb83a8c1ca16c903c8127773bca8f506767e65276f78e748526d2eb589', 2344],
  };
  const inputs = {
    one_plain: batch(plain, 1),
    one_scripted: batch(scripted, 1),
    eight_plain: batch(plain, 8),
    eight_scripted: batch(scripted, 8),
    eight_mixed: batch(recipes, 8),
  };
  for (const [name, [digest, bytes]] of Object.entries(recorded)) {
    const compiled = compileNativePatch(inputs[name]);
    assert.equal(sha(compiled.ini), digest, name);
    assert.equal(compiled.bytes, bytes, name);
    // Naming the tutorial's parameters changes nothing: they are the defaults.
    const named = compileNativePatch(inputs[name], {
      base: NATIVE_BASE,
      anchor: TUTORIAL_ANCHOR,
      context: 'validated',
    });
    assert.equal(sha(named.ini), digest, name + ' with explicit tutorial parameters');
  }
  assert.deepEqual(compileNativePatch(inputs.one_plain).options, {
    base: NATIVE_BASE,
    anchor: TUTORIAL_ANCHOR,
    context: 'validated',
    layout: 'slot',
    limit: NATIVE_LIMIT,
  });
});

const mining = { base: 0x80dc6f48, anchor: 0x80dc6f48 + 0x183dfc, context: 'activation' };
const wordsOf = compiled => compiled.hooks.flatMap(h => h.words);

test('another level gets its own base and anchor, and one call context for every source', () => {
  const additions = [
    { id: -1, source: 0x1000, model: 0x2000, position: [1, 2, 3], heading: 45, scale: 100 },
    { id: -2, source: 0x3000, model: 0x2000, script: 0x4000, position: [4, 5, 6], heading: 0, scale: 100 },
  ];
  const compiled = compileNativePatch(additions, mining);
  assert.deepEqual(
    compiled.hooks.map(h => h.address),
    [0x80062b88],
    'script-less and scripted sources share the activation manager hook',
  );
  const words = wordsOf(compiled);
  // lis r3, hi(anchor) ; ori r3, r3, lo(anchor)
  assert.ok(words.includes((0x3c600000 | (mining.anchor >>> 16)) >>> 0));
  assert.ok(words.includes((0x60630000 | (mining.anchor & 0xffff)) >>> 0));
  assert.ok(
    !words.includes((0x3c600000 | (TUTORIAL_ANCHOR >>> 16)) >>> 0) || mining.anchor >>> 16 === TUTORIAL_ANCHOR >>> 16,
  );
  for (const a of additions) assert.ok(words.includes(mining.base + a.source), 'source addressed from the level base');
  assert.ok(words.includes(mining.base + 0x4000), 'script addressed from the level base');
  assert.ok(!words.includes(NATIVE_BASE + 0x1000), 'nothing is addressed from the tutorial base');

  // The same request on the tutorial keeps the two validated contexts.
  assert.equal(compileNativePatch(additions).hooks.length, 2);
});

test('a level without a readiness anchor cannot compile, and options are validated', () => {
  const a = { id: -1, source: 0x1000, model: 0x2000, position: [0, 0, 0], heading: 0, scale: 100 };
  assert.throws(() => compileNativePatch([a], { base: 0x80dc6f48, context: 'activation' }), /scene snapshot/);
  assert.throws(() => nativeOptions({ base: 0x80dc6f49 }), /word-aligned/);
  assert.throws(() => nativeOptions({ base: 0x70000000 }), /MEM1/);
  assert.throws(() => nativeOptions({ anchor: 12 }), /anchor/);
  assert.throws(() => nativeOptions({ context: 'somewhere' }), /context/);
  assert.throws(() => nativeOptions({ layout: 'heap' }), /layout/);
  assert.throws(() => nativeOptions({ limit: 0 }), /limit/);
  // A source beyond MEM1 from this base is refused, as it is from the tutorial's.
  assert.throws(() => compileNativePatch([{ ...a, source: 0x1000000 }], mining), /offset/);
});

test('capacity is measured: 18 with the proven slot, 59 with the table, never past the Gecko budget', () => {
  assert.equal(nativeCapacity({}, { scripted: false }), 18);
  assert.equal(nativeCapacity({}, { scripted: true }), 18);
  assert.equal(nativeCapacity(mining), 18);
  const table = { ...mining, layout: 'table' };
  const capacity = nativeCapacity(table);
  assert.equal(capacity, 59);

  const many = n =>
    Array.from({ length: n }, (_, i) => ({
      id: -i - 1,
      source: 0x100 * (i + 1),
      model: 0x40,
      position: [i, 2, 3],
      heading: i,
      scale: 100,
    }));
  const full = compileNativePatch(many(capacity), { ...table, limit: capacity });
  assert.ok(full.bytes <= GECKO_CODE_BUDGET);
  assert.equal(full.stride, TABLE_STRIDE);
  assert.throws(() => compileNativePatch(many(capacity + 1), { ...table, limit: capacity + 1 }), /capacity/);
  // The confirmed limit still guards every caller that does not ask for more.
  assert.throws(() => compileNativePatch(many(9), table), /1\.\.8/);
});

test('a table row holds the request, and the shared argument block starts empty', () => {
  const a = {
    id: -7,
    source: 0x1230,
    model: 0x2340,
    script: 0x3450,
    position: [1.5, -2.25, 3],
    heading: 270,
    scale: 100,
  };
  const compiled = compileNativePatch([a], { ...mining, layout: 'table' });
  const words = wordsOf(compiled);
  const f32 = n => {
    const b = Buffer.alloc(4);
    b.writeFloatBE(n);
    return b.readUInt32BE(0);
  };
  const at = compiled.records_offset / 4;
  const row = words.slice(at, at + TABLE_STRIDE / 4);
  assert.deepEqual(row, [
    0,
    0,
    -7 >>> 0,
    f32(1.5),
    f32(-2.25),
    f32(3),
    mining.base + 0x1230,
    f32(270),
    mining.base + 0x2340,
    mining.base + 0x3450,
  ]);
  const block = words.slice(at - NATIVE_STRIDE / 4, at);
  assert.ok(block.every(w => w === 0));
  assert.deepEqual(words.slice(at - NATIVE_STRIDE / 4 - 4, at - NATIVE_STRIDE / 4), [0x50464e48, 0, 1, TABLE_STRIDE]);
});

// The Gecko area as the game holds it: Dolphin copies the code list there, lines as pairs of words.
function geckoArea(compiled) {
  const area = Buffer.alloc(GECKO_AREA.size);
  let p = 0x300; // after the code handler
  for (const line of compiled.lines)
    for (const word of line.split(' ')) {
      area.writeUInt32BE(parseInt(word, 16), p);
      p += 4;
    }
  return area;
}

function fakeMemory(regions) {
  return async (address, length) => {
    for (const [start, bytes] of regions)
      if (address >= start && address + length <= start + bytes.length)
        return Buffer.from(bytes.subarray(address - start, address - start + length));
    return Buffer.alloc(length);
  };
}

for (const layout of ['slot', 'table'])
  test(`created instances are verified from the level's own base with the ${layout} layout`, async () => {
    const options = { ...mining, layout };
    const additions = [
      // A stored template as the source: no actor of its own, which the activation context allows.
      { id: -1, source: 0x1000, model: 0x2000, position: [10, 2, 3], heading: 90, scale: 100 },
      { id: -2, source: 0x1200, model: 0x2000, script: 0x4000, position: [12.5, 2, 3], heading: 0, scale: 100 },
    ];
    const compiled = compileNativePatch(additions, options);
    const area = geckoArea(compiled);
    assert.deepEqual(
      locateAdditionRows(area, additions, options).map(rows => rows.length),
      [1, 1],
    );

    // What the game would leave behind: attempt 2 and the instance pointer in each row, and live instances.
    const level = Buffer.alloc(0x5000);
    const instances = Buffer.alloc(0x400);
    const instancesAt = 0x81000000;
    const rowFields = layout === 'table' ? TABLE : SLOT;
    const located = locateAdditionRows(area, additions, options);
    additions.forEach((a, i) => {
      const source = a.source;
      level.writeUInt32BE(PLACEMENT_CLASS, source + INSTANCE.class);
      level.writeUInt32BE(a.script == null ? 0 : mining.base + a.script, source + INSTANCE.script);
      const at = i * 0x100;
      instances.writeUInt32BE(PLACEMENT_CLASS, at + INSTANCE.class);
      a.position.forEach((n, k) => instances.writeFloatBE(n, at + INSTANCE.position + k * 4));
      a.position.forEach((n, k) => instances.writeFloatBE(n, at + INSTANCE.current_position + k * 4));
      instances.writeFloatBE(a.heading, at + INSTANCE.heading);
      instances.writeFloatBE(a.heading, at + INSTANCE.current_heading);
      instances.writeUInt32BE(1, at + INSTANCE.state);
      instances.writeUInt32BE(mining.base + a.source, at + INSTANCE.parent);
      instances.writeUInt32BE(a.script == null ? 0 : mining.base + a.script, at + INSTANCE.script);
      instances.writeUInt32BE(mining.base + a.model, at + INSTANCE.model);
      instances.writeUInt32BE(0x81100000 + i * 0x100, at + INSTANCE.actor);
      area.writeUInt32BE(2, located[i][0].at + rowFields.attempt);
      area.writeUInt32BE(instancesAt + at, located[i][0].at + rowFields.pointer);
    });
    assert.ok(INSTANCE_BYTES <= 0x100);
    const read = fakeMemory([
      [GECKO_AREA.start, area],
      [mining.base, level],
      [instancesAt, instances],
    ]);
    const verified = await verifyNativeInstances(additions, read, options);
    assert.equal(verified.verified, true);
    assert.deepEqual(
      verified.objects.map(o => o.pointer),
      [instancesAt, instancesAt + 0x100],
    );

    // Read from the tutorial's base, the same memory proves nothing.
    await assert.rejects(verifyNativeInstances(additions, read, { layout }), /not uniquely consumed/);
    // An instance that is not where it was asked is a failure, whatever the layout.
    instances.writeFloatBE(99, INSTANCE.position);
    await assert.rejects(verifyNativeInstances(additions, read, options), /does not match the patch/);
  });

function levelSession(archive = 'level/Level_000_Mining.bld') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-native-levels-'));
  const file = path.join(dir, 'level.bld.decoded');
  fs.writeFileSync(file, syntheticLevel().buf);
  const s = openSession(file, { archive, entry: 3, deps: gates });
  s.snapshots_dir = path.join(dir, 'snapshots');
  return { s, dir };
}

const snapshotOf = (s, rows, extra = {}) => ({
  version: 1,
  archive: s.archive,
  original_sha256: s.original_sha256,
  run: 'test-run',
  moment: 'first playable frame',
  taken: '2026-09-17T18:00:00.000Z',
  base: 0x80d00000,
  placements: rows,
  actors: [],
  ...extra,
});

test('level parameters come from the newest scene snapshot, and from nothing else', () => {
  const { s } = levelSession();
  const [crate, barrel, camera] = s.placements;
  assert.equal(nativeParamsFor(s).available, false);
  assert.match(nativeParamsFor(s).reason, /scene snapshot/);
  // Not having been measured does not block an addition: the launch will measure the level (native-live.mjs).
  assert.equal(classifyAddition(s, crate).status, 'needs_test');

  // The camera is active too, but a still, visible, script-less prop is the better landmark.
  const rows = [
    { offset: camera.offset, state: 1, actor: 0x81000100, moved: 0 },
    { offset: barrel.offset, state: 1, actor: 0x81000200, moved: 0 },
    { offset: crate.offset, state: 2, actor: 0, moved: 0 },
  ];
  assert.deepEqual(chooseAnchor(s, snapshotOf(s, rows)), { offset: barrel.offset, name: 'Barrel_01', rank: 0 });
  saveSnapshot(snapshotOf(s, rows), { dir: s.snapshots_dir });
  const params = nativeParamsFor(s);
  assert.equal(params.available, true);
  assert.deepEqual(params.options, {
    base: 0x80d00000,
    anchor: 0x80d00000 + barrel.offset,
    context: 'activation',
  });
  assert.equal(params.anchor.name, 'Barrel_01');
  assert.equal(params.snapshot.run, 'test-run');
  // With parameters the level's objects can be added, as experimental additions the next launch verifies.
  const verdict = classifyAddition(s, crate);
  assert.equal(verdict.testable, true);
  assert.equal(verdict.available, true);
  assert.equal(verdict.experimental, true);
  assert.equal(verdict.status, 'needs_test');

  // A snapshot of another version of the level, or one where nothing is active, gives no parameters.
  assert.match(
    nativeParamsFor(s, { snapshot: snapshotOf(s, rows, { original_sha256: 'other' }) }).reason,
    /another version/,
  );
  assert.match(nativeParamsFor(s, { snapshot: snapshotOf(s, [rows[2]]) }).reason, /active with an actor/);
  assert.match(nativeParamsFor(s, { snapshot: snapshotOf(s, rows, { base: null }) }).reason, /locate/);
});

test('the tutorial keeps its validated parameters whatever snapshots exist', () => {
  const { s } = levelSession('level/Level_027_Tutorial.bld');
  const params = nativeParamsFor(s);
  assert.equal(params.available, true);
  assert.deepEqual(params.options, {});
  assert.equal(params.anchor.address, TUTORIAL_ANCHOR);
});

test('a batch lays its sources on a grid, goes through save, patch and the redirect, and judges each source', async () => {
  const { s, dir } = levelSession();
  const [crate, barrel, camera] = s.placements;
  s.level = {
    name: 'Level_000_Mining',
    tutorial: false,
    companion: { archive: 'level/Level_000_Mining.arc', file: path.join(dir, 'mining.arc'), present: true },
    redirect: { archive: 'level/Level_027_Tutorial.bld', companion: 'level/Level_027_Tutorial.arc' },
  };
  saveSnapshot(snapshotOf(s, [{ offset: barrel.offset, state: 1, actor: 0x81000200, moved: 0 }]), {
    dir: s.snapshots_dir,
  });

  // A camera has nothing to draw: it is a source like any other, with a zero model word.
  const [invisible] = batchAdditions(s, [camera.offset], { origin: [0, 0, 0] });
  assert.equal(invisible.model, null);
  assert.equal(invisible.experimental, true);
  const compiledInvisible = compileNativePatch([invisible], {
    base: 0x80d00000,
    anchor: 0x80d00100,
    context: 'activation',
  });
  assert.equal(compiledInvisible.hooks[0].words[(compiledInvisible.records_offset + 0x84) / 4], 0);
  assert.throws(() => batchAdditions(s, [crate.offset, crate.offset], { origin: [0, 0, 0] }), /distinct/);
  assert.throws(() => batchAdditions(s, [crate.offset], { origin: [0, NaN, 0] }), /origin/);
  const additions = batchAdditions(s, [crate.offset, barrel.offset], { origin: [5, 1, -2], spacing: 2, columns: 1 });
  assert.deepEqual(
    additions.map(a => [a.id, a.source, a.position]),
    [
      [-1, crate.offset, [5, 1, -2]],
      [-2, barrel.offset, [5, 1, 0]],
    ],
  );
  assert.equal(additions[0].heading, 90);
  // Crate_01 appears twice with the same model: one family, its nearest member first.
  assert.deepEqual(campaignSources(s, { origin: [29, 0, 7], count: 8 }), [s.placements[3].offset, camera.offset]);

  const runs = [];
  const deps = {
    build: () => ({
      dir,
      replacements: [],
      redirect: { dir: path.join(dir, 'redirect'), replacements: [], entry_archive: 'level/Level_027_Tutorial.bld' },
    }),
    run: async args => {
      runs.push(args);
      const rows = await Promise.resolve(
        args.patch.native_additions.additions.map(a => ({
          id: a.id,
          source: a.source,
          runtime: a.id === -1 ? 'passed' : 'failed',
          reason: a.id === -1 ? 'Distinct native instance and actor observed.' : 'Source guards have not passed yet.',
          state: a.id === -1 ? 1 : null,
        })),
      );
      return {
        id: 'batch-run',
        status: 'MACRO_COMPLETED',
        consumption: { verified: true },
        native_samples: [{ capture: null, rows }],
      };
    },
  };
  const before = fs.readFileSync(s.file);
  const places = { outDir: path.join(dir, 'campaigns'), reports: path.join(dir, 'launch-reports') };
  const result = await runLevelBatch(s, {
    sources: [crate.offset, barrel.offset],
    origin: [5, 1, -2],
    deps,
    ...places,
  });
  assert.ok(fs.readFileSync(s.file).equals(before), 'the opened level is never written');
  const run = runs[0];
  assert.equal(run.mode, 'direct-test');
  assert.equal(run.archive, 'level/Level_027_Tutorial.bld');
  assert.equal(run.patch.dir, path.join(dir, 'redirect'));
  assert.deepEqual(run.redirect, { level: 'level/Level_000_Mining.bld', name: 'Level_000_Mining' });
  assert.equal(typeof run.nativeInspect, 'function');
  const native = run.patch.native_additions;
  assert.equal(native.options.base, 0x80d00000);
  assert.equal(native.options.context, 'activation');
  assert.equal(sha(fs.readFileSync(native.file, 'utf8')), native.sha256);
  assert.equal(
    sha(compileNativePatch(native.additions, native.options).ini),
    native.sha256,
    'the installer can recompile it',
  );
  assert.deepEqual(
    result.results.map(r => [r.name, r.runtime]),
    [
      ['Crate_01', 'passed'],
      ['Barrel_01', 'failed'],
    ],
  );
  assert.ok(fs.existsSync(result.file));

  // Like any launch, the boot filed what it saw under each family. The crate and the barrel share a model and have
  // no script, so they are one family, and its verdict is the worse of the two.
  const filed = fs.readdirSync(places.reports).map(f => JSON.parse(fs.readFileSync(path.join(places.reports, f))));
  assert.equal(filed.length, 1);
  assert.equal(filed[0].family, result.results[0].family);
  assert.deepEqual(
    [filed[0].runtime, filed[0].launches.length, filed[0].launches[0].additions, filed[0].launches[0].run],
    ['failed', 1, 2, 'batch-run'],
  );

  // An edited scene is not a batch: the campaign measures sources, not the user's work.
  s.edits.push({ kind: 'transform' });
  await assert.rejects(runLevelBatch(s, { sources: [crate.offset], origin: [0, 0, 0], deps, ...places }), /unedited/);
});

test('a source seen alive at a capture but gone at the end is observed, not passed', () => {
  const additions = [
    { id: -1, source: 8 },
    { id: -2, source: 16 },
  ];
  const row = (id, runtime) => ({ id, source: id === -1 ? 8 : 16, runtime, reason: runtime });
  const judged = judgeRun(additions, [
    { capture: 'a', rows: [row(-1, 'passed'), row(-2, 'failed')] },
    { capture: null, rows: [row(-1, 'inconclusive'), row(-2, 'failed')] },
  ]);
  assert.deepEqual(
    judged.map(r => r.runtime),
    ['observed', 'failed'],
  );
  assert.deepEqual(
    judgeRun(additions, []).map(r => r.runtime),
    ['failed', 'failed'],
  );
});
