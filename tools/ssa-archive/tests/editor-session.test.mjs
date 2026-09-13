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

// ---------------------------------------------------------------------------------------------------------
// Feature 003 T025: editing in memory. An intent changes the session, never the file; only a save writes.

import { applyEdit, undo, redo, canEdit } from '../src/editor/session.mjs';
import { replaceTargets } from '../src/editor/server.mjs';
import { interchangeable } from '../src/editor/session.mjs';

const openTest = () => openSession(levelFile(), opts());
const first = s => s.placements[0];

test('edit: a transform intent updates the record in memory, marks the session dirty and leaves the file alone', () => {
  const s = openTest();
  const before = fs.readFileSync(s.file);
  const r = applyEdit(s, { kind: 'transform', target: first(s).offset, position: [11, 12, 13], heading: 45, scale: 250 });
  assert.deepEqual(r.placement.position, [11, 12, 13]);
  assert.equal(r.placement.rotation.heading, 45);
  assert.equal(r.placement.scale, 250);
  assert.equal(r.dirty, true);
  assert.equal(r.undo_depth, 1);
  assert.equal(s.dirty, true);
  assert.deepEqual(first(s).position, [11, 12, 13], 'the session record is the edited one');
  assert.ok(before.equals(fs.readFileSync(s.file)), 'the file on disk is untouched until a save');
  assert.ok(!before.equals(s.buffer), 'but the working buffer carries the change');
});

test('edit: a partial intent changes only the attributes it names', () => {
  const s = openTest();
  const p0 = { ...first(s), position: [...first(s).position] };
  applyEdit(s, { kind: 'transform', target: p0.offset, heading: 15 });
  assert.deepEqual(first(s).position, p0.position, 'position untouched');
  assert.equal(first(s).scale, p0.scale, 'scale untouched');
  assert.equal(first(s).rotation.heading, 15);
});

test('edit: undo and redo walk the history, and a new edit discards the redo stack', () => {
  const s = openTest();
  const start = [...first(s).position];
  applyEdit(s, { kind: 'transform', target: first(s).offset, position: [1, 1, 1] });
  applyEdit(s, { kind: 'transform', target: first(s).offset, position: [2, 2, 2] });
  assert.equal(s.edits.length, 2);

  assert.deepEqual(undo(s).placement.position, [1, 1, 1]);
  assert.deepEqual(undo(s).placement.position, start);
  assert.equal(s.dirty, false, 'undone back to the opened state is not dirty');
  assert.equal(undo(s), null, 'nothing left to undo');

  assert.deepEqual(redo(s).placement.position, [1, 1, 1]);
  assert.equal(s.dirty, true);
  applyEdit(s, { kind: 'transform', target: first(s).offset, position: [9, 9, 9] });
  assert.equal(s.undone.length, 0, 'a new edit discards what was undone');
  assert.equal(redo(s), null);
});

test('edit: undoing every edit restores the opened bytes exactly', () => {
  const s = openTest();
  const original = Buffer.from(s.buffer);
  applyEdit(s, { kind: 'transform', target: first(s).offset, position: [5, 6, 7], heading: 33, scale: 80 });
  applyEdit(s, { kind: 'transform', target: s.placements[1].offset, position: [1, 2, 3] });
  undo(s); undo(s);
  assert.ok(original.equals(s.buffer), 'byte for byte back to how it opened');
});

test('edit: an attribute the record has no evidence for is refused, and says which evidence is missing', () => {
  const s = openTest();
  assert.deepEqual(canEdit(first(s), 'position').ok, true);
  const blind = { ...first(s), evidence: { ...first(s).evidence, layout: '' } };
  const no = canEdit(blind, 'position');
  assert.equal(no.ok, false);
  assert.equal(no.error, 'EVIDENCE_MISSING');
  assert.match(no.reason, /layout/i);
  const unsupported = canEdit(first(s), 'model');
  assert.equal(unsupported.error, 'UNSUPPORTED_FIELD');
  assert.throws(() => applyEdit(s, { kind: 'transform', target: first(s).offset, model: 'x' }), /UNSUPPORTED_FIELD|unsupported/i);
});

test('edit: an intent naming an offset that is not a placement is refused', () => {
  const s = openTest();
  assert.throws(() => applyEdit(s, { kind: 'transform', target: 0x999999, position: [0, 0, 0] }), /NO_SUCH_PLACEMENT|no placement/i);
  assert.throws(() => applyEdit(s, { kind: 'transform', target: first(s).offset, position: [1, 2] }), /three/i);
  assert.throws(() => applyEdit(s, { kind: 'transform', target: first(s).offset }), /nothing to change/i);
});

test('edit: undo restores the exact bytes, not the rounded value the inspector shows', () => {
  const s = openTest();
  const p = first(s);
  // A float with more digits than the record displays: 82.252 is shown, 82.25200653076172 is stored.
  s.buffer.writeFloatBE(82.25200653076172, p.offset + 0x24);
  const exact = Buffer.from(s.buffer.subarray(p.offset + 0x24, p.offset + 0x30));
  applyEdit(s, { kind: 'transform', target: p.offset, position: [1, 2, 3] });
  undo(s);
  assert.ok(exact.equals(s.buffer.subarray(p.offset + 0x24, p.offset + 0x30)),
    'restoring the displayed 82.252 instead of the stored bytes would silently rewrite the field');
});

// ---------------------------------------------------------------------------------------------------------
// Feature 003 T042: duplication. A replacement consumes a slot and can silently retexture other objects, so it
// is the one operation that must never happen because a control was easy to reach.

import { syntheticFixups } from './helpers/synthetic-level.mjs';

function mapped() {
  const built = syntheticLevel();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-dup-'));
  const file = path.join(dir, 'level.bld.decoded');
  fs.writeFileSync(file, built.buf);
  return openSession(file, { archive: 'level/Test.bld', entry: 3, fixups: syntheticFixups(built), deps: { gates: passing } });
}

test('duplicate: only same-size slots are offered, and never the source itself', () => {
  const s = mapped();
  const src = s.placements[0];
  const targets = replaceTargets(s, src);
  assert.ok(targets.length > 0);
  assert.ok(targets.every(t => t.span === src.span), 'a different size cannot keep the count-bounded walk aligned');
  assert.ok(targets.every(t => t.offset !== src.offset));
});

test('duplicate: a slot that copies a different number of bytes is refused outright', () => {
  const s = mapped();
  const src = s.placements[0], victim = s.placements[1];
  // What matters is the block the recipe copies, not the distance between table entries: the pair confirmed in
  // game differs on the second (0x1498 against 0x834) and matches on the first (0x1C8 each).
  const copy = s.copy.get(victim.offset);
  s.copy.set(victim.offset, { ...copy, size: copy.size + 16 });
  assert.throws(() => applyEdit(s, { kind: 'replace', target: victim.offset, source: src.offset }),
    e => e.error === 'SPAN_MISMATCH' && /block of/.test(e.message));
});

test('duplicate: a wrapped placement and an unwrapped one are never offered for each other', () => {
  const s = mapped();
  const [a, b] = [s.placements[0].offset, s.placements[1].offset];
  assert.equal(interchangeable(s, a, b), true, 'two unwrapped slots of the same size can stand in for each other');
  s.copy.set(b, { ...s.copy.get(b), wrapped: true, wrapper: b - 0x48 });
  assert.equal(interchangeable(s, a, b), false, 'one wrapped and one not is a different recipe, not a smaller one');
});

test('duplicate: a level with no runtime map is refused, because a write needs pointer evidence', () => {
  const s = openTest();                                              // opened without fixups
  assert.equal(s.has_runtime_map, false);
  assert.throws(() => applyEdit(s, { kind: 'replace', target: s.placements[1].offset, source: s.placements[0].offset }),
    e => e.error === 'RUNTIME_MAP_REQUIRED' && /pointer/i.test(e.message));
});

test('duplicate: the copy lands in the slot, keeps the slot name, and the source is untouched', () => {
  const s = mapped();
  const src = s.placements[0], victim = s.placements[3];
  const victimName = victim.name, sourceModel = src.model.path;
  const sourceBytes = Buffer.from(s.buffer.subarray(src.offset, src.offset + src.span));

  const r = applyEdit(s, { kind: 'replace', target: victim.offset, source: src.offset, position: [42, 3, 9] });
  assert.equal(r.dirty, true);
  const after = s.placements.find(p => p.offset === victim.offset);
  assert.equal(after.name, victimName, 'the slot keeps its own name so scripts still find it');
  assert.equal(after.model.path, sourceModel, 'and shows the source model');
  assert.deepEqual(after.position, [42, 3, 9]);
  assert.ok(sourceBytes.equals(s.buffer.subarray(src.offset, src.offset + src.span)), 'the source is not moved or altered');
  assert.ok(r.plan, 'the plan that authorised it travels with the result');
  assert.match(r.plan.recipe, /t104-generic|wrapper-proven/);
});

test('duplicate: undo puts the sacrificed slot back exactly', () => {
  const s = mapped();
  const src = s.placements[0], victim = s.placements[3];
  const original = Buffer.from(s.buffer);
  applyEdit(s, { kind: 'replace', target: victim.offset, source: src.offset });
  assert.ok(!original.equals(s.buffer), 'something changed');
  undo(s);
  assert.ok(original.equals(s.buffer), 'and undo restored every byte of it');
  assert.equal(s.placements.find(p => p.offset === victim.offset).name, victim.name);
});
