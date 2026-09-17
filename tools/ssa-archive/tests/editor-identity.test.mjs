import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syntheticLevel } from './helpers/synthetic-level.mjs';
import { openSession, applyEdit, undo } from '../src/editor/session.mjs';
import { save } from '../src/editor/save.mjs';

// Feature 003, after the first real editing session. Four different objects ended up sharing one x,z: a grab of
// the gizmo handle doubled as a click, the click re-selected whatever proxy sat under the handle, and the drag
// committed the outline's position to that object. From the outside it read as "moving A duplicated it".
//
// The view-side cause is fixed in select.mjs. These tests pin the property the editor must hold regardless of
// what the view does: a transform is an edit to ONE record's three layout fields and to nothing else. The count
// does not change, no record appears or disappears, and every record keeps its name, model, behaviour and layers.

const here = path.dirname(fileURLToPath(import.meta.url));
const TUTORIAL = path.resolve(here, '../../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded');
const haveTutorial = fs.existsSync(TUTORIAL);
const gates = { gates: () => ({ status: 'PASS' }) };
const open = file => openSession(file, { archive: 'level/x.bld', entry: 3, deps: gates });

// Everything about a placement that a transform must leave alone: every field of the frozen contract except the
// three it is allowed to change. Written by subtraction so a field added to the contract later is covered by default.
const identity = p => {
  const { position, rotation, scale, ...rest } = p;
  return JSON.stringify(rest);
};
const snapshot = s => new Map(s.placements.map(p => [p.offset, identity(p)]));

function synthetic() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-id-')), 'level.decoded');
  fs.writeFileSync(file, syntheticLevel().buf);
  return file;
}

// A burst of edits shaped like the session that went wrong: several objects, mixed fields, the same position
// handed to more than one of them, and a couple of re-edits of the same object.
function burst(s) {
  const targets = s.placements.filter(p => p.model.path).slice(0, 6);
  assert.ok(targets.length >= 3, 'the fixture needs a few modelled placements');
  const spot = [-159.847, 26.514, 38.834];
  const intents = [];
  targets.forEach((p, i) => {
    intents.push({ kind: 'transform', target: p.offset, position: [spot[0], spot[1] + i * 9, spot[2]] });
    if (i % 2 === 0) intents.push({ kind: 'transform', target: p.offset, heading: (p.rotation.heading + 90) % 360 });
    if (i % 3 === 0) intents.push({ kind: 'transform', target: p.offset, scale: 400 });
  });
  intents.push({ kind: 'transform', target: targets[0].offset, position: [spot[0] + 5, spot[1], spot[2]] });
  for (const intent of intents) applyEdit(s, intent);
  return { targets, intents };
}

for (const [label, file, skip] of [
  ['synthetic', synthetic, false],
  ['the tutorial', () => TUTORIAL, !haveTutorial && 'local sample absent'],
]) {
  test(`identity (${label}): a burst of transforms leaves the placement count exactly where it was`, { skip }, () => {
    const s = open(file());
    const before = s.placements.length;
    burst(s);
    assert.equal(s.placements.length, before);
    assert.equal(new Set(s.placements.map(p => p.offset)).size, before, 'no offset appears twice');
  });

  test(
    `identity (${label}): every record keeps its name, model, behaviour and layers through the burst`,
    { skip },
    () => {
      const s = open(file());
      const before = snapshot(s);
      const { targets } = burst(s);
      const after = snapshot(s);
      assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), 'the same set of records');
      for (const [offset, id] of before)
        assert.equal(
          after.get(offset),
          id,
          `record 0x${offset.toString(16)} changed something other than its transform`,
        );
      // And the objects that were edited are the ones that moved: the target of an intent is the record that changes.
      for (const t of targets) {
        const p = s.placements.find(x => x.offset === t.offset);
        assert.equal(p.position[0].toFixed(1), (t === targets[0] ? -154.8 : -159.8).toFixed(1));
      }
    },
  );

  test(
    `identity (${label}): two objects given the same position are two objects at one place, not one object twice`,
    { skip },
    () => {
      const s = open(file());
      const [a, b] = s.placements.filter(p => p.model.path);
      const spot = [12.5, 3.25, -7.75];
      applyEdit(s, { kind: 'transform', target: a.offset, position: spot });
      applyEdit(s, { kind: 'transform', target: b.offset, position: spot });
      const atSpot = s.placements.filter(p => p.position.every((v, i) => Math.abs(v - spot[i]) < 1e-3));
      assert.equal(atSpot.length, 2);
      assert.deepEqual(atSpot.map(p => p.offset).sort(), [a.offset, b.offset].sort());
      assert.notEqual(atSpot[0].name, undefined);
      assert.notEqual(
        identity(atSpot[0]),
        identity(atSpot[1]),
        'they are still distinguishable by everything but position',
      );
    },
  );

  test(`identity (${label}): the saved bytes touch only the edited records' layout words`, { skip }, () => {
    const s = open(file());
    const original = fs.readFileSync(file() === TUTORIAL ? TUTORIAL : s.file);
    const { targets } = burst(s);
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-id-out-')), 'edited.decoded');
    const w = save(s, { out });
    assert.equal(w.plan.status, 'VALID');
    assert.equal(w.plan.bytes_changed_outside, 0);
    const edited = fs.readFileSync(out);
    assert.equal(edited.length, original.length, 'a transform never changes the file length');
    const allowed = new Set();
    for (const t of targets) for (const off of [0x24, 0x28, 0x2c, 0x34, 0xb8]) allowed.add(t.offset + off);
    for (let q = 0; q + 4 <= original.length; q += 4) {
      if (original.readUInt32BE(q) !== edited.readUInt32BE(q))
        assert.ok(allowed.has(q), `word 0x${q.toString(16)} changed and belongs to no edited record's layout`);
    }
  });

  test(`identity (${label}): undoing the burst restores every record byte for byte`, { skip }, () => {
    const s = open(file());
    const before = s.placements.map(p => JSON.stringify(p));
    const { intents } = burst(s);
    for (let i = 0; i < intents.length; i++) undo(s);
    assert.deepEqual(
      s.placements.map(p => JSON.stringify(p)),
      before,
    );
    assert.equal(s.dirty, false);
  });
}
