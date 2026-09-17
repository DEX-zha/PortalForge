import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openSession } from '../src/editor/session.mjs';
import { scriptedPreviews } from '../src/editor/scripted-previews.mjs';
import { sceneRoles } from '../src/editor/scene-roles.mjs';
import { scriptedPose } from '../src/view/scripted-pose.mjs';

const file = new URL('../../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded', import.meta.url);
const skip = !fs.existsSync(file) && 'local game sample absent';

test('bridge and cannon previews match the tutorial actor poses read in Dolphin', { skip }, () => {
  const s = openSession(fileURLToPath(file));
  const before = Buffer.from(s.buffer),
    previews = scriptedPreviews(s);
  const dock = previews.find(p => p.owner === 1776460);
  const bridge = previews.find(p => p.owner === 1875316);
  assert.equal(dock.heading, -46);
  assert.equal(dock.template, 1783120);
  assert.equal(bridge.heading, -44);
  assert.equal(bridge.template, 1777576);
  const cannon = previews.filter(p => p.owner === 2302624);
  assert.deepEqual(
    cannon.map(p => [p.template, p.heading]),
    [
      [2155316, 156],
      [2169700, 0],
    ],
  );
  assert.ok(cannon.every(p => p.position.every((v, i) => Math.abs(v - [11.7154, 2.62972, 40.91574][i]) < 0.001)));
  assert.deepEqual(s.buffer, before, 'preview reconstruction must not patch game bytes');
  const roles = sceneRoles(s);
  assert.ok(roles.some(r => r.offset === 2155316));
  assert.ok(!roles.some(r => r.offset === 2302624));
  assert.deepEqual(roles.find(r => r.offset === 4124024).counterparts, [
    { offset: 1823456, name: 'Legendary_Treasure_Ancient_Shell(1)' },
  ]);
  assert.ok(!roles.some(r => r.offset === 1823456));
});

test('refresh keeps the bridge quarter turn and the independent cannon base orientation', () => {
  const owner = { position: [1, 2, 3], rotation: { heading: 80 }, scale: 200 };
  const bridge = { position: [0, 0, 0], heading: -46, heading_offset: -90, scale: 100, scale_mode: 'template' };
  assert.deepEqual(scriptedPose(bridge, owner), { position: [1, 2, 3], heading: -10, scale: 100 });
  assert.equal(scriptedPose({ ...bridge, fixed_heading: 0 }, owner).heading, 0);
  owner.rotation.heading = 44;
  assert.equal(scriptedPose(bridge, owner).heading, -46, 'undo must restore the same relative pose');
});

test('unrelated levels do not receive tutorial visibility interpretations', () => {
  assert.deepEqual(sceneRoles({ placements: [] }), []);
});
