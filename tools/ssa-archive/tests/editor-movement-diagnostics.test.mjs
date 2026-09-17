import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openSession, applyEdit, undo, redo } from '../src/editor/session.mjs';
import { scriptDiagnostics, cloneAtOwner } from '../src/editor/script-diagnostics.mjs';
import { renderPlacement } from '../src/view/inspector.mjs';

const file = new URL('../../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded', import.meta.url);
const skip = !fs.existsSync(file) && 'local game sample absent';
const tutorial = () => openSession(fileURLToPath(file));
const at = (s, offset) => s.placements.find(p => p.offset === offset);

test('clone anchor accepts only a bounded singleton me expression, never a variable or a truncated list', () => {
  const buffer = Buffer.alloc(256),
    sec = { offset: 32, size: 224 };
  const session = { buffer, graph: { sections: [sec], object_section: 0 } };
  const op = 40,
    list = 120,
    array = 152;
  buffer.writeUInt32BE(list - sec.offset, op + 0x28);
  buffer.writeUInt32BE(114, list);
  buffer.writeUInt32BE(1, list + 8);
  buffer.writeUInt32BE(1, list + 12);
  buffer.writeUInt32BE(0x80000004, list + 16);
  buffer.writeUInt32BE(array - sec.offset, list + 20);
  buffer.writeUInt32BE(0x8000005b, array);
  assert.equal(cloneAtOwner(session, op), true);
  buffer.writeUInt32BE(0x8000000a, array);
  assert.equal(cloneAtOwner(session, op), false);
  buffer.writeUInt32BE(0x8000005b, array);
  buffer.writeUInt32BE(2, list + 8);
  assert.equal(cloneAtOwner(session, op), false);
  buffer.writeUInt32BE(9999 - sec.offset, op + 0x28);
  assert.equal(cloneAtOwner(session, op), false);
  assert.equal(cloneAtOwner(session, 250), false);
});

test('Barrel resource links to active counterparts; a shared model does not share their positions', { skip }, () => {
  const s = tutorial(),
    template = at(s, 3983352),
    barrel = at(s, 3074164);
  const d = scriptDiagnostics(s, template);
  assert.equal(d.movement.kind, 'resource');
  assert.ok(d.movement.targets.some(p => p.offset === barrel.offset && p.relation === 'counterpart'));
  const before = Buffer.from(s.buffer),
    templateBefore = { ...template, position: [...template.position] };
  applyEdit(s, { kind: 'transform', target: barrel.offset, position: [88, 11.5, 40] });
  const moved = Buffer.from(s.buffer);
  assert.deepEqual(template.position, templateBefore.position);
  const changes = [];
  for (let i = 0; i < before.length; i += 4) if (before.readUInt32BE(i) !== moved.readUInt32BE(i)) changes.push(i);
  assert.deepEqual(
    changes,
    [0x24, 0x28, 0x2c].map(n => n + barrel.offset),
  );
  assert.equal(scriptDiagnostics(s, barrel).movement.kind, 'initial_position');
  assert.deepEqual(
    scriptDiagnostics(s, template).movement.targets.find(p => p.offset === barrel.offset).position,
    [88, 11.5, 40],
    'links use current positions, not cached startup coordinates',
  );
  undo(s);
  assert.deepEqual(s.buffer, before);
  redo(s);
  assert.deepEqual(s.buffer, moved);
});

test('a cloned bridge resource offers conditional creator anchors instead of its storage position', { skip }, () => {
  const s = tutorial(),
    template = at(s, 1777576);
  const d = scriptDiagnostics(s, template);
  const link = d.movement.targets.find(p => p.offset === 1875316);
  assert.equal(link.relation, 'creator');
  assert.equal(link.conditional, true);
  assert.ok(!d.movement.targets.some(p => p.offset === 1776460), 'the ID-1 Dock creates a different startup resource');
  assert.ok(d.movement.targets.every(p => p.offset !== template.offset));
  const html = renderPlacement(template, [], [], { script: d });
  assert.match(html, /data-counterpart="1875316"/);
  assert.match(html, /Conditional/);
  assert.match(html, /In-game movement/);
});

test('motion opcodes and shared model warnings do not claim every scripted position is reset', { skip }, () => {
  const s = tutorial(),
    barrel = at(s, 3074164),
    d = scriptDiagnostics(s, barrel);
  const html = renderPlacement(barrel, [], [], { script: d });
  assert.match(html, /independent position/);
  assert.match(html, /copies or debris/);
  assert.doesNotMatch(html, /A stored position may subsequently be recalculated/);
  const blades = at(s, 3296324);
  assert.equal(scriptDiagnostics(s, blades).movement.kind, 'initial_position');
  assert.equal(scriptDiagnostics(s, blades).movement.targets.length, 0);
});
