import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPatchWorkspace } from '../src/patch/riivolution.mjs';

test('patch workspace contains only differing files, a valid Riivolution XML and a forward-slash descriptor', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-patch-'));
  const game = path.join(dir, 'fake.wbfs');
  fs.writeFileSync(game, Buffer.alloc(16));
  const orig1 = path.join(dir, 'orig1.arc');
  fs.writeFileSync(orig1, Buffer.alloc(3000, 1));
  const repl1 = path.join(dir, 'repl1.arc');
  fs.writeFileSync(repl1, Buffer.alloc(61447, 2));
  const orig2 = path.join(dir, 'orig2.bld');
  fs.writeFileSync(orig2, Buffer.alloc(500, 3));
  const same2 = path.join(dir, 'same2.bld');
  fs.writeFileSync(same2, Buffer.alloc(500, 3));
  const out = path.join(dir, 'patch');
  const ws = buildPatchWorkspace({
    experimentId: 'm1-test',
    game,
    replacements: [
      { disc_path: 'level/Level_027_Tutorial.arc', file: repl1, original: orig1 },
      { disc_path: 'level/Level_027_Tutorial.bld', file: same2, original: orig2 },
    ],
    outDir: out,
  });
  assert.equal(ws.replacements.length, 1);
  assert.equal(ws.replacements[0].disc_path, 'level/Level_027_Tutorial.arc');
  assert.deepEqual(ws.skipped_identical, ['level/Level_027_Tutorial.bld']);
  assert.equal(ws.expected_monitor_sizes['level/Level_027_Tutorial.arc'], '61 kB');
  const xml = fs.readFileSync(ws.xml, 'utf8');
  assert.match(xml, /<wiidisc version="1">/);
  assert.match(xml, /<id game="SSP" developer="52"><region type="P" \/><\/id>/);
  // external must start with '/' so Dolphin resolves it from the descriptor root, not the XML folder
  assert.match(
    xml,
    /<file disc="\/level\/Level_027_Tutorial.arc" external="\/files\/level\/Level_027_Tutorial.arc" resize="true" create="false" \/>/,
  );
  assert.doesNotMatch(xml, /Level_027_Tutorial\.bld/);
  const d = JSON.parse(fs.readFileSync(ws.descriptor, 'utf8'));
  for (const p of [d['base-file'], d.riivolution.patches[0].xml, d.riivolution.patches[0].root])
    assert.ok(!p.includes('\\'), p);
  assert.deepEqual(d.riivolution.patches[0].options, [{ 'option-id': 'm1-test', choice: 1 }]);
  assert.ok(fs.existsSync(path.join(out, 'files', 'level', 'Level_027_Tutorial.arc')));
  assert.ok(!fs.existsSync(path.join(out, 'files', 'level', 'Level_027_Tutorial.bld')));
  const patchJson = JSON.parse(fs.readFileSync(path.join(out, 'patch.json'), 'utf8'));
  assert.equal(patchJson.replacements[0].sha256.length, 64);
});

test('memory patches are written as Riivolution memory elements, a block through a value file, and refused outside RAM', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-patch-memory-'));
  const game = path.join(dir, 'fake.wbfs');
  fs.writeFileSync(game, Buffer.alloc(16));
  const replacement = path.join(dir, 'level.bld');
  fs.writeFileSync(replacement, Buffer.alloc(2048, 7));
  const block = Buffer.alloc(0x1000, 0x5a);
  const base = { experimentId: 'memory-test', game, outDir: path.join(dir, 'patch'), force: true };
  const replacements = [{ disc_path: 'level/Level_027_Tutorial.bld', file: replacement }];
  const ws = buildPatchWorkspace({
    ...base,
    replacements,
    memory: [
      { offset: 0x80003128, value: '935a0000' },
      { offset: 0x935a0000, bytes: block },
    ],
  });
  const xml = fs.readFileSync(ws.xml, 'utf8');
  assert.match(xml, /<memory offset="0x80003128" value="935A0000" \/>/);
  // Like a replacement file, the value file is named from the descriptor root.
  assert.match(xml, /<memory offset="0x935A0000" valuefile="\/memory\/0x935A0000\.bin" \/>/);
  assert.ok(fs.readFileSync(path.join(ws.dir, 'memory', '0x935A0000.bin')).equals(block));
  assert.deepEqual(
    ws.memory.map(m => [m.offset, m.value ?? m.size]),
    [
      [0x80003128, '935A0000'],
      [0x935a0000, 0x1000],
    ],
  );
  // A patch that writes nothing into memory says nothing about memory: existing descriptors do not change.
  const plain = buildPatchWorkspace({ ...base, outDir: path.join(dir, 'plain'), replacements });
  assert.equal(plain.memory, undefined);
  assert.doesNotMatch(fs.readFileSync(plain.xml, 'utf8'), /<memory/);
  assert.throws(
    () => buildPatchWorkspace({ ...base, replacements, memory: [{ offset: 0x1000, value: '00' }] }),
    /MEM1 or MEM2/,
  );
  assert.throws(
    () => buildPatchWorkspace({ ...base, replacements, memory: [{ offset: 0x80003128, value: 'xyz' }] }),
    /hex bytes/,
  );
});
