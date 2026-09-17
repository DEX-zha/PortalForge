import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { syntheticLevel } from './helpers/synthetic-level.mjs';
import { openSession, applyEdit } from '../src/editor/session.mjs';
import { save, patch, launch } from '../src/editor/save.mjs';
import {
  compileNativePatch,
  nativeCapacity,
  GECKO_CODE_BUDGET,
  LIVE_HEADER,
  LIVE_HEADER_BYTES,
  LIVE_HEADER_MAGIC,
  NATIVE_STRIDE,
  TABLE,
  TABLE_STRIDE,
} from '../src/editor/native-patch.mjs';
import { locateLiveTable, liveRows, writeLiveTable, liveArrival } from '../src/editor/native-live.mjs';
import { locateAdditionRows } from '../src/editor/native-run.mjs';
import { watchAdditions } from '../src/editor/native-watch.mjs';
import { latestSnapshot } from '../src/editor/scene-snapshot.mjs';
import { nativeParamsFor } from '../src/editor/native-params.mjs';
import { GECKO_AREA } from '../src/editor/native-layout.mjs';
import { catalog } from '../src/editor/catalog.mjs';

// Feature 007, additions on every level. A level that was never measured gets a patch whose routine carries no
// addition; the launch measures the level when it reaches it and writes the table into the running game. These
// tests stand up the Gecko area as the game holds it and check the routine's data, the write protocol, the
// launch's part and what the run reads back. Nothing here boots a game.

const sha = text => createHash('sha256').update(text).digest('hex');
const gates = { gates: () => ({ status: 'PASS' }) };

function geckoArea(compiled) {
  const area = Buffer.alloc(GECKO_AREA.size);
  let p = 0xb38; // where Dolphin's code list starts, after its handler
  for (const line of compiled.lines)
    for (const word of line.split(' ')) {
      area.writeUInt32BE(parseInt(word, 16), p);
      p += 4;
    }
  return area;
}

// Memory that remembers the order of its writes, as the bridge would apply them.
function memory(area) {
  const writes = [];
  const put = (address, bytes) => {
    bytes.copy(area, address - GECKO_AREA.start);
    writes.push({ at: address - GECKO_AREA.start, length: bytes.length });
  };
  return {
    writes,
    read: async (address, length) =>
      Buffer.from(area.subarray(address - GECKO_AREA.start, address - GECKO_AREA.start + length)),
    write: {
      bytes: async (address, bytes) => put(address, bytes),
      u32: async (address, value) => {
        const word = Buffer.alloc(4);
        word.writeUInt32BE(value >>> 0);
        put(address, word);
      },
    },
  };
}

test('the live routine carries no addition, is the same for every level, and fills the Gecko budget', () => {
  const capacity = nativeCapacity({ layout: 'live' });
  assert.equal(capacity, 59);
  const routine = compileNativePatch([], { layout: 'live', capacity });
  assert.ok(routine.bytes <= GECKO_CODE_BUDGET);
  assert.throws(() => compileNativePatch([], { layout: 'live', capacity: capacity + 1 }), /capacity/);
  assert.deepEqual(
    routine.hooks.map(h => h.address),
    [0x80062b88],
    'the activation manager hook',
  );
  assert.equal(routine.options.context, 'activation');
  assert.equal(routine.count, 0);

  // Whatever additions or level parameters are given, the bytes are the same: nothing of a level is compiled in.
  const other = compileNativePatch([{ id: -1, source: 8, model: 16, position: [1, 2, 3], heading: 0, scale: 100 }], {
    layout: 'live',
    capacity,
    base: 0x80dc6f48,
    anchor: 0x80f4ad44,
  });
  assert.equal(sha(other.ini), sha(routine.ini));

  const table = locateLiveTable(geckoArea(routine));
  assert.deepEqual([table.capacity, table.count, table.anchor], [capacity, 0, 0], 'an empty table is inert');
  const words = routine.hooks[0].words;
  const header = words.indexOf(LIVE_HEADER_MAGIC);
  assert.deepEqual(words.slice(header, header + LIVE_HEADER_BYTES / 4), [
    LIVE_HEADER_MAGIC,
    0,
    0,
    TABLE_STRIDE,
    0,
    capacity,
  ]);
  assert.ok(
    words.slice(header + LIVE_HEADER_BYTES / 4).every(w => w === 0 || w === 0x60000000),
    'block and rows are empty',
  );
});

test('the table is written rows first and count last, and read back with the level base', async () => {
  const routine = compileNativePatch([], { layout: 'live', capacity: 8 });
  const area = geckoArea(routine);
  const game = memory(area);
  const base = 0x80dc6f48;
  const additions = [
    { id: -1, source: 0x1230, model: 0x2340, script: 0x3450, position: [1.5, -2.25, 3], heading: 270, scale: 100 },
    { id: -2, source: 0x1430, model: null, position: [4, 5, 6], heading: 0, scale: 100, experimental: true },
  ];
  const written = await writeLiveTable({ additions, base, anchor: base + 0x500, ...game });
  assert.deepEqual([written.capacity, written.written], [8, 2]);

  const table = locateLiveTable(area);
  const order = game.writes.map(w => w.at - table.at);
  assert.deepEqual(order, [
    LIVE_HEADER.count,
    LIVE_HEADER_BYTES + NATIVE_STRIDE,
    LIVE_HEADER.anchor,
    LIVE_HEADER.count,
  ]);
  assert.deepEqual([table.count, table.anchor], [2, base + 0x500]);
  assert.ok(area.subarray(table.rows, table.rows + 2 * TABLE_STRIDE).equals(liveRows(additions, base)));
  assert.equal(area.readUInt32BE(table.rows + TABLE_STRIDE + TABLE.model), 0, 'nothing to draw: a zero model word');
  assert.equal(area.readUInt32BE(table.rows + TABLE.script), base + 0x3450);

  const located = locateAdditionRows(area, additions, { base, anchor: base + 0x500, layout: 'live', capacity: 8 });
  assert.deepEqual(
    located.map(rows => rows.length),
    [1, 1],
  );
  assert.deepEqual(
    locateAdditionRows(area, additions, { layout: 'live', capacity: 8 }).map(r => r.length),
    [0, 0],
  );

  await assert.rejects(
    writeLiveTable({
      additions: Array.from({ length: 9 }, (_, i) => ({ ...additions[0], id: -i - 1 })),
      base,
      anchor: base,
      ...game,
    }),
    /holds 8/,
  );
  await assert.rejects(
    writeLiveTable({
      additions,
      base,
      anchor: base,
      read: async () => Buffer.alloc(GECKO_AREA.size),
      write: game.write,
    }),
    /not installed/,
  );
});

function unmeasuredLevel(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-live-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'level.decoded');
  fs.writeFileSync(file, syntheticLevel().buf);
  const s = openSession(file, { archive: 'level/Level_039_UndeadVolcano.bld', entry: 3, deps: gates });
  s.snapshots_dir = path.join(dir, 'snapshots');
  return { s, dir };
}

test('a level never measured patches the live routine, and its launch measures it and writes the additions', async t => {
  const { s, dir } = unmeasuredLevel(t);
  const [crate, barrel] = s.placements;
  applyEdit(s, { kind: 'add', source: crate.offset, position: [4, 5, 6] });
  // The Project pane counts against what the live routine holds, not against nothing.
  assert.deepEqual(catalog(s).addition_capacity, { used: 1, limit: 59, confirmed: 8, fits: { slot: 18, table: 59 } });
  assert.ok(save(s, { out: path.join(dir, 'edited.decoded') }).written);
  patch(s, { deps: { build: () => ({ dir, replacements: [] }) } });
  const native = s.lastPatch.native_additions;
  assert.equal(native.live, true);
  assert.deepEqual([native.options.layout, native.options.capacity], ['live', 59]);
  assert.equal(
    sha(compileNativePatch(native.additions, native.options).ini),
    native.sha256,
    'the installer recompiles it',
  );

  // The launch hands the run a way to measure the level; the fake run calls it as the first capture would.
  const area = geckoArea(compileNativePatch([], native.options));
  const game = memory(area);
  const measure = { base: 0x80d00000, placements: [{ offset: barrel.offset, state: 1, actor: 0x81000200, moved: 0 }] };
  let arrived = null;
  const deps = {
    build: () => ({ dir, replacements: [] }),
    snapshotDir: s.snapshots_dir,
    liveArrival: (session, additions, services) =>
      liveArrival(session, additions, {
        ...services,
        ...game,
        capture: async (sess, { run, moment }) => ({
          version: 1,
          archive: sess.archive,
          original_sha256: sess.original_sha256,
          run,
          moment,
          taken: '2026-09-17T20:00:00.000Z',
          actors: [],
          ...measure,
        }),
      }),
    run: async args => {
      arrived = await args.nativeArrival({ run: 'live-run' });
      return { id: 'live-run', status: 'MACRO_COMPLETED', consumption: { verified: true } };
    },
  };
  await launch(s, { mode: 'play', deps, wait: true });
  assert.equal(arrived.base, 0x80d00000);
  assert.equal(arrived.anchor.name, 'Barrel_01');
  assert.deepEqual(arrived.options, {
    base: 0x80d00000,
    anchor: 0x80d00000 + barrel.offset,
    context: 'activation',
    layout: 'live',
    capacity: 59,
  });
  const table = locateLiveTable(area);
  assert.deepEqual([table.count, table.anchor], [1, 0x80d00000 + barrel.offset]);
  assert.equal(area.readUInt32BE(table.rows + TABLE.source), 0x80d00000 + crate.offset);

  // The measure stays: the level now has parameters, and its next patch compiles the table in.
  assert.equal(latestSnapshot(s.archive, { dir: s.snapshots_dir }).run, 'live-run');
  assert.equal(nativeParamsFor(s).available, true);
  patch(s, { deps });
  assert.equal(s.lastPatch.native_additions.live, undefined);
  assert.equal(s.lastPatch.native_additions.options.layout, 'slot');
  assert.equal(s.lastPatch.native_additions.options.base, 0x80d00000);
});

const liveNative = () => ({
  live: true,
  additions: [{ id: -1, source: 8, model: 16, position: [0, 0, 0], heading: 0, scale: 100, experimental: true }],
  options: { layout: 'live', capacity: 59 },
});

test('a run reads nothing before the level is measured, measures at the first capture of it, then reads with the measure', async () => {
  const record = {};
  const calls = [];
  const watch = watchAdditions({
    native: liveNative(),
    record,
    run: 'r1',
    arrival: async ({ run }) => {
      calls.push('arrival ' + run);
      return {
        options: { base: 0x80d00000, layout: 'live' },
        base: 0x80d00000,
        anchor: { name: 'Barrel_01' },
        written: 1,
      };
    },
    services: {
      inspect: async (rows, read, options) => {
        calls.push('inspect base ' + options.base.toString(16));
        return rows.map(a => ({ id: a.id, source: a.source, runtime: 'passed', reason: 'seen' }));
      },
      verify: async () => ({ verified: true, objects: [{ id: -1 }] }),
    },
  });
  await watch.atCapture('run-03-redirect-loading.png');
  assert.deepEqual(calls, [], 'a capture before the level is not a reason to measure');
  await watch.atCapture('run-05-redirect-arrived-1.png');
  await watch.atCapture('run-08-redirect-arrived-2.png');
  await watch.atEnd();
  assert.deepEqual(calls, ['arrival r1', 'inspect base 80d00000', 'inspect base 80d00000', 'inspect base 80d00000']);
  assert.deepEqual(record.native_arrival, {
    base: 0x80d00000,
    anchor: { name: 'Barrel_01' },
    written: 1,
    additions: 1,
    attempts: 1,
  });
  assert.equal(record.native_samples.length, 3);
  assert.equal(record.native_additions.verified, true);
});

test('a level that cannot be measured is a recorded result, retried a few times, never a crash', async () => {
  const record = {};
  let attempts = 0;
  const watch = watchAdditions({
    native: liveNative(),
    record,
    run: 'r2',
    arrival: async () => {
      attempts++;
      throw Error('no placed record was found in memory');
    },
    services: { inspect: async () => assert.fail('nothing to inspect before the measure'), verify: async () => ({}) },
  });
  for (let i = 0; i < 8; i++) await watch.atCapture(`run-arrived-${i}.png`);
  assert.equal(attempts, 6);
  await watch.atEnd();
  assert.equal(record.native_samples, undefined);
  assert.equal(record.native_additions.verified, false);
  assert.match(record.native_additions.reason, /could not be measured: no placed record/);

  // In classic play nothing is tried before the level's archive has been read from the disc.
  const late = {};
  let tried = 0;
  const playing = watchAdditions({
    native: liveNative(),
    record: late,
    run: 'r3',
    arrival: async () => {
      tried++;
      return { options: { base: 0x80d00000, layout: 'live' } };
    },
    services: { inspect: async rows => rows.map(a => ({ id: a.id, runtime: 'passed' })), verify: async () => ({}) },
  });
  await playing.whilePlaying({ levelRead: false });
  assert.equal(tried, 0);
  await playing.whilePlaying({ levelRead: true });
  assert.equal(tried, 1);
  assert.equal(late.native_samples.length, 1);
  await playing.whilePlaying({ levelRead: true });
  assert.equal(late.native_samples.length, 1, 'once every addition was seen alive, play is left alone');

  // A live patch launched without a way to measure says so instead of reading garbage.
  const orphan = {};
  await watchAdditions({ native: liveNative(), record: orphan, run: 'r4' }).atEnd();
  assert.match(orphan.native_additions.reason, /no way to measure/);
});

test('a batch on a level never measured is laid out by the run, beside the anchor it measured', async t => {
  const { s, dir } = unmeasuredLevel(t);
  const [crate, barrel] = s.placements;
  s.level = {
    name: 'Level_039_UndeadVolcano',
    tutorial: false,
    companion: { archive: 'level/Level_039_UndeadVolcano.arc', file: path.join(dir, 'volcano.arc'), present: true },
    redirect: { archive: 'level/Level_027_Tutorial.bld', companion: 'level/Level_027_Tutorial.arc' },
  };
  const { runLevelBatch } = await import('../src/editor/addition-campaign.mjs');
  const area = geckoArea(compileNativePatch([], { layout: 'live', capacity: 59 }));
  const game = memory(area);
  const measure = { base: 0x80d00000, placements: [{ offset: barrel.offset, state: 1, actor: 0x81000200, moved: 0 }] };
  let reached = true;
  const deps = {
    build: () => ({
      dir,
      replacements: [],
      redirect: { dir: path.join(dir, 'redirect'), replacements: [], entry_archive: 'level/Level_027_Tutorial.bld' },
    }),
    liveArrival: (session, additions, services) =>
      liveArrival(session, additions, {
        ...services,
        ...game,
        capture: async sess => ({
          version: 1,
          archive: sess.archive,
          original_sha256: sess.original_sha256,
          taken: '2026-09-17T21:00:00.000Z',
          actors: [],
          ...measure,
        }),
      }),
    run: async args => {
      assert.equal(args.patch.native_additions.live, true);
      assert.deepEqual(args.patch.native_additions.additions, [], 'nothing is decided before the level is measured');
      if (!reached) return { id: 'never-arrived', status: 'MACRO_COMPLETED', consumption: { verified: true } };
      // The run reaches the level: it measures it, which lays the batch out and writes it into the game.
      const arrived = await args.nativeArrival({ run: 'live-batch' });
      const rows = arrived.additions.map(a => ({ id: a.id, source: a.source, runtime: 'passed', reason: 'seen' }));
      return {
        id: 'live-batch',
        status: 'MACRO_COMPLETED',
        consumption: { verified: true },
        native_arrival: { base: arrived.base, anchor: arrived.anchor, written: arrived.written },
        native_samples: [{ capture: null, rows }],
      };
    },
  };
  const places = { outDir: path.join(dir, 'campaigns'), reports: path.join(dir, 'reports') };
  const batch = await runLevelBatch(s, { sources: [crate.offset], layout: 'live', deps, ...places });
  assert.equal(batch.live, true);
  assert.equal(batch.params.base, 0x80d00000);
  assert.equal(batch.params.anchor.name, 'Barrel_01');
  // Beside the anchor: two units along x and z from the barrel, at its height.
  assert.deepEqual(batch.origin, [barrel.position[0] + 2, barrel.position[1], barrel.position[2] + 2]);
  assert.deepEqual(
    batch.additions.map(a => [a.source, a.position]),
    [[crate.offset, batch.origin]],
  );
  assert.deepEqual(
    batch.results.map(r => [r.name, r.runtime]),
    [['Crate_01', 'passed']],
  );
  assert.equal(locateLiveTable(area).count, 1);
  assert.equal(fs.readdirSync(places.reports).length, 1, 'filed like any launch');

  // A run that never reaches the level planned nothing, and says so rather than inventing a batch.
  reached = false;
  const lost = await runLevelBatch(s, { sources: [crate.offset], layout: 'live', deps, ...places });
  assert.deepEqual([lost.additions, lost.results, lost.params], [[], [], null]);
});
