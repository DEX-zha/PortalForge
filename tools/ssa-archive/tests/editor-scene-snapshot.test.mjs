import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syntheticLevel } from './helpers/synthetic-level.mjs';
import { openSession } from '../src/editor/session.mjs';
import { startServer } from '../src/editor/server.mjs';
import {
  anchorPlacements,
  locateResidentSection,
  readResidentSection,
  placementStates,
  captureSceneSnapshot,
  saveSnapshot,
  latestSnapshot,
  snapshotSummary,
  pointerWords,
  findTriple,
  MEM1,
} from '../src/editor/scene-snapshot.mjs';
import { INSTANCE, PLACEMENT_CLASS } from '../src/editor/native-layout.mjs';

// Feature 006, the game-time view. A snapshot is read from the game's memory, so these tests stand up a fake
// MEM1 holding the level image at some base, with runtime states and current positions written where the game
// writes them, and check that the module finds the level, reads every record and says what each one is.

const gates = { gates: () => ({ status: 'PASS' }) };

function machine() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-snapshot-'));
  const file = path.join(dir, 'level.decoded');
  fs.writeFileSync(file, syntheticLevel().buf);
  const s = openSession(file, { archive: 'level/Level_000_Mining.bld', entry: 3, deps: gates });
  // The level image lives at `base`; everything else in MEM1 is zero. The game writes its class pointer and
  // its runtime words into every constructed record.
  const base = 0x80d00000;
  // The file image, then free memory in which the game creates instances at run time.
  const image = Buffer.concat([s.buffer, Buffer.alloc(0x400)]);
  const [p0, p1, p2, p3] = s.placements;
  const stamp = (p, state, actor, current) => {
    image.writeUInt32BE(PLACEMENT_CLASS, p.offset);
    image.writeUInt32BE(state, p.offset + INSTANCE.state);
    image.writeUInt32BE(actor, p.offset + INSTANCE.actor);
    [0, 4, 8].forEach((k, i) => image.writeFloatBE(current[i], p.offset + INSTANCE.current_position + k));
    image.writeFloatBE(33, p.offset + INSTANCE.current_heading);
  };
  stamp(p0, 1, 0x81100000, [p0.position[0] + 6, p0.position[1], p0.position[2]]); // active, moved by a script
  stamp(p1, 2, 0, p1.position); // dormant
  stamp(p2, 3, 0, p2.position); // finished
  stamp(p3, 5, 0, p3.position); // template
  // A clone of the first crate, created by a script outside the resident section: same class, the crate's
  // model and (absent) script, its own position.
  const createdAt = Math.ceil((s.buffer.length + 0x40) / 32) * 32; // instances are 32-aligned in MEM1
  image.writeUInt32BE(PLACEMENT_CLASS, createdAt);
  image.writeUInt32BE(1, createdAt + INSTANCE.state);
  image.writeUInt32BE(0x81100200, createdAt + INSTANCE.actor);
  image.writeUInt32BE(base + p0.model.offset, createdAt + INSTANCE.model);
  [0, 4, 8].forEach((k, i) => image.writeFloatBE([50, 2, 60][i], createdAt + INSTANCE.current_position + k));
  [0, 4, 8].forEach((k, i) => image.writeFloatBE([50, 2, 60][i], createdAt + INSTANCE.position + k));
  const reads = [];
  const readBytes = async (address, n) => {
    reads.push([address, n]);
    const out = Buffer.alloc(n);
    const lo = Math.max(address, base),
      hi = Math.min(address + n, base + image.length);
    if (hi > lo) image.copy(out, lo - address, lo - base, hi - base);
    return out;
  };
  return { dir, s, base, image, readBytes, reads, placements: [p0, p1, p2, p3] };
}

test('anchors are placed records with a unique position away from the origin', () => {
  const { s } = machine();
  const anchors = anchorPlacements(s);
  assert.ok(anchors.length >= 2);
  for (const a of anchors) assert.ok(a.position.some(v => Math.abs(v) > 1));
  const seen = new Set(anchors.map(a => a.position.join(',')));
  assert.equal(seen.size, anchors.length, 'no two anchors share a position');
});

test('the resident section is found by its anchor triple, checked on a second placement, and read whole', async () => {
  const { s, base, readBytes, reads } = machine();
  const located = await locateResidentSection(s, readBytes, { start: 0x80c00000 });
  assert.equal(located.base, base);
  assert.ok(reads.every(([a]) => a >= MEM1.start && a < MEM1.end));
  const resident = await readResidentSection(s, base, readBytes);
  const sec = s.graph.sections[s.graph.object_section];
  assert.equal(resident.length, sec.offset + sec.size);
  assert.ok(resident.subarray(0, 16).equals(s.buffer.subarray(0, 16)), 'the image is the file with runtime words');
});

test('every placement gets its runtime state, its actor and how far the game moved it', async () => {
  const { s, base, readBytes, placements } = machine();
  const rows = placementStates(s, await readResidentSection(s, base, readBytes));
  assert.deepEqual(
    rows.map(r => [r.name, r.label, !!r.actor, r.moved]),
    [
      ['Crate_01', 'active', true, 6],
      ['Barrel_01', 'dormant', false, 0],
      ['CS_Camera01', 'finished', false, 0],
      ['Crate_01', 'template', false, 0],
    ],
  );
  assert.equal(rows[0].heading, 33);
  assert.ok(rows.every(r => r.constructed));
  assert.deepEqual(rows[0].current, [
    placements[0].position[0] + 6,
    placements[0].position[1],
    placements[0].position[2],
  ]);
});

test('incomplete memory reads and sections outside MEM1 cannot become snapshot evidence', async () => {
  const { s, base } = machine();
  const shortRead = async (_address, size) => Buffer.alloc(size - 1);
  await assert.rejects(readResidentSection(s, base, shortRead), /incomplete snapshot read/);
  await assert.rejects(locateResidentSection(s, shortRead), /incomplete snapshot read/);
  let reads = 0;
  const read = async () => {
    reads++;
    return Buffer.alloc(0);
  };
  await assert.rejects(readResidentSection(s, MEM1.end - 4, read), /outside MEM1/);
  await assert.rejects(locateResidentSection(s, read, { start: MEM1.end }), /outside MEM1/);
  assert.equal(reads, 0);
});

test('a snapshot is captured, saved under its level, found again as the newest, and summarised for the view', async () => {
  const { dir, s, readBytes } = machine();
  const snapshot = await captureSceneSnapshot(s, { readBytes, run: 'editor-direct-play-test', moment: 'test' });
  assert.deepEqual(snapshot.counts, { active: 1, dormant: 1, finished: 1, template: 1 });
  assert.equal(snapshot.moved, 1);
  assert.equal(snapshot.confidence, 'LIKELY');
  assert.equal(snapshot.editable, false);
  // The clone is found by its class word outside the section and paired with the crate by model and script.
  assert.equal(snapshot.actors.length, 1);
  assert.equal(snapshot.actors[0].template.name, 'Crate_01');
  assert.equal(snapshot.actors[0].template.label, 'active');
  assert.deepEqual(snapshot.actors[0].current, [50, 2, 60]);
  assert.equal(snapshot.actors[0].actor, true);
  assert.equal(snapshot.actors[0].model, 'crate.mdl');
  const file = saveSnapshot(snapshot, { dir });
  assert.ok(file.startsWith(path.join(dir, 'level_000_mining')));
  assert.equal(latestSnapshot('level/Level_000_Mining.bld', { dir }).run, 'editor-direct-play-test');
  assert.equal(latestSnapshot('level/Level_001_Castle.bld', { dir }), null);
  const later = { ...snapshot, run: 'later', taken: '2030-01-01T00:00:00.000Z' };
  saveSnapshot(later, { dir });
  assert.equal(latestSnapshot('level/Level_000_Mining.bld', { dir }).run, 'later');
  const summary = snapshotSummary({ file, ...snapshot }, s);
  assert.equal(summary.same_bytes, true);
  assert.equal(summary.states[s.placements[1].offset].label, 'dormant');
  assert.equal(summary.states[s.placements[0].offset].moved, 6);
  assert.equal(summary.created, 1);
  assert.deepEqual(
    summary.actors.map(a => [a.template, a.resource_offset, a.position, a.actor]),
    [['Crate_01', s.placements[0].offset, [50, 2, 60], true]],
  );
  assert.ok(!('creator_offset' in summary.actors[0]), 'no creator is claimed for a clone');
  assert.equal(snapshotSummary(null), null);
});

test('the server serves the newest snapshot and captures one only while its own run is playing', async () => {
  const { dir, s, readBytes } = machine();
  const server = await startServer({ session: s, port: 0, deps: { snapshotDir: dir, readBytes } });
  const get = p => fetch(`${server.url}${p}`).then(r => r.json());
  const post = (p, body = {}) =>
    fetch(`${server.url}${p}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async r => ({ status: r.status, body: await r.json() }));
  try {
    assert.deepEqual(await get('/api/snapshot'), { snapshot: null, capturable: false });
    const refused = await post('/api/snapshot', { moment: 'now' });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, 'NOT_PLAYING');
    s.lastLaunch = { running: true, progress: { phase: 'playing' }, experiment_id: null };
    s.lastPatch = { experiment_id: 'edit-x' };
    const taken = await post('/api/snapshot', { moment: 'at the first crate' });
    assert.equal(taken.status, 200, JSON.stringify(taken.body));
    assert.equal(taken.body.snapshot.moment, 'at the first crate');
    assert.equal(taken.body.snapshot.run, 'edit-x');
    assert.deepEqual(taken.body.snapshot.counts, { active: 1, dormant: 1, finished: 1, template: 1 });
    const again = await get('/api/snapshot');
    assert.equal(again.snapshot.moment, 'at the first crate');
    assert.equal(again.capturable, true);
    assert.ok(fs.existsSync(again.snapshot.file));
  } finally {
    await server.close();
  }
});

test('pointer words and float triples are found where they are, and nowhere else', () => {
  const buf = Buffer.alloc(64);
  buf.writeUInt32BE(0x80d00010, 8);
  buf.writeUInt32BE(0x12345678, 12);
  buf.writeUInt32BE(0x81700000, 40);
  assert.deepEqual(pointerWords(buf), [
    { offset: 8, value: 0x80d00010 },
    { offset: 40, value: 0x81700000 },
  ]);
  buf.writeFloatBE(1.5, 20);
  buf.writeFloatBE(-2, 24);
  buf.writeFloatBE(3.25, 28);
  assert.deepEqual(findTriple(buf, [1.5, -2, 3.25]), [20]);
  assert.deepEqual(findTriple(buf, [1.5, -2, 3.3]), []);
  assert.deepEqual(findTriple(buf, [1.5, -2, 3.251], 0.002), [20]);
});
