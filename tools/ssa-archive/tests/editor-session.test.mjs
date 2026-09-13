import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildIgz } from './helpers/synthetic-igz.mjs';
import { syntheticLevel } from './helpers/synthetic-level.mjs';
import { openSession } from '../src/editor/session.mjs';

// Feature 003 T004. A session that opens on a file it cannot vouch for is worse than no session at all, so every
// refusal below names the file and the reason and produces nothing.

function levelFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-session-'));
  const file = path.join(dir, 'level.bld.decoded');
  fs.writeFileSync(file, syntheticLevel().buf);
  return file;
}

const passing = () => ({ status: 'PASS' });
const opts = extra => ({ archive: 'level/Test.bld', entry: 3, deps: { gates: passing }, ...extra });

test('session: opening a level exposes the frozen records, the layers and what was detected', () => {
  const file = levelFile();
  const s = openSession(file, opts());
  assert.match(s.id, /^s_[0-9a-f]{6,}$/);
  assert.equal(s.file, path.resolve(file));
  assert.equal(s.archive, 'level/Test.bld');
  assert.equal(s.entry, 3);
  assert.match(s.original_sha256, /^[0-9a-f]{64}$/);
  assert.equal(s.placements.length, 4);
  assert.equal(s.has_runtime_map, false);
  assert.equal(s.detection.placement_type, 77);
  assert.deepEqual(s.edits, []);
  assert.equal(s.dirty, false);
  assert.equal(s.locked, false);
  for (const p of s.placements) assert.equal(p.model_version, 1);
});

test('session: layers are derived, counted and graded, and an unlayered placement is still reachable', () => {
  const s = openSession(levelFile(), opts());
  const props = s.layers.find(l => l.name === 'Props');
  assert.ok(props, 'the named list that claims placements becomes a layer');
  assert.equal(props.count, 3);
  assert.equal(typeof props.grades, 'object');
  const unlayered = s.layers.find(l => l.name === '(unlayered)');
  assert.ok(unlayered, 'the marker claimed by nothing still belongs to a group');
  assert.equal(unlayered.count, 1);
  assert.equal(s.layers.reduce((n, l) => n + l.count, 0), s.placements.length);
});

test('session: opening refuses when the gates do not report M1 and M2 as PASS', () => {
  const file = levelFile();
  const gates = g => ({ status: g === 'm2' ? 'FAIL' : 'PASS' });
  assert.throws(() => openSession(file, opts({ deps: { gates } })), e =>
    /M2/.test(e.message) && e.message.includes(path.resolve(file)) && e.exitCode === 2);
});

test('session: opening refuses a file with no detectable placement class', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-session-'));
  const file = path.join(dir, 'empty.bld.decoded');
  fs.writeFileSync(file, buildIgz({ objects: [{ type: 3, size: 0x20 }, { type: 4, size: 0x20 }], headTable: [0, 1] }).buf);
  assert.throws(() => openSession(file, opts()), e =>
    /no placement class/i.test(e.message) && e.message.includes(path.resolve(file)) && e.exitCode === 2);
});

test('session: opening refuses when a resolved record does not match the frozen contract', () => {
  const file = levelFile();
  // inject a resolver that returns a record missing a required field; the session must not present it
  const resolve = (buf, graph) => ({ file_has_placements: true, placements: 1, counts: { direct: 1 }, models: [], detection: { chosen: { strict: 1, entries: 1 } },
    classes: { placement_type: 1, model_type: 2 }, rows: [{ offset: 16, span: 32, name: 'broken' }] });
  assert.throws(() => openSession(file, opts({ deps: { gates: passing, resolve } })), e =>
    /placement-v1|contract/i.test(e.message) && /0x10/.test(e.message) && e.exitCode === 2);
});
