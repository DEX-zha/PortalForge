import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAddition, groupCandidates } from '../src/editor/addition-compatibility.mjs';
import { compileNativePatch, compileNativeProbe, NATIVE_LIMIT } from '../src/editor/native-patch.mjs';
import { inspectProbe } from '../src/editor/addition-probe.mjs';
import { GameSession } from '../src/experiments/run-game.mjs';
const p = (offset = 10, script = null) => ({
  offset,
  name: 'Barrel',
  scale: 100,
  model: { offset: 200, path: 'Objects/barrel.mdl', status: 'direct' },
  behavior: script ? { offset: 300, path: script } : null,
  position: [0, 0, 0],
  rotation: { heading: 0 },
});
const session = placements => ({
  placements,
  archive: 'level/Level_027_Tutorial.bld',
  has_runtime_map: true,
  original_sha256: 'fixture',
});
test('macro waits for checkpoint inspection before the next input can change actor lifetime', async () => {
  const game = new GameSession(() => {}),
    events = [];
  game.screenshot = async () => {
    events.push('capture');
    return 'tutorial.png';
  };
  game.press = async () => events.push('input');
  await game.runScriptSafe([{ shot: 'tutorial' }, { press: 'A' }], {
    onShot: async () => {
      await new Promise(r => setTimeout(r, 5));
      events.push('inspection');
    },
  });
  assert.deepEqual(events, ['capture', 'inspection', 'input']);
});
test('an unverified scripted object can be added as an experimental addition, and is never called confirmed', () => {
  const row = p(10, 'Barrel.ai'),
    s = session([row]);
  const r = classifyAddition(s, row);
  assert.equal(r.status, 'needs_script_test');
  assert.equal(r.available, true);
  assert.equal(r.experimental, true);
  assert.equal(r.label, 'Add · script not verified');
  assert.match(r.reason, /next launch/);
  assert.equal(r.testable, true);
  assert.ok(r.checks.some(c => c.id === 'script' && c.status === 'pending'));
});
test('an object with nothing to draw is addable; only what cannot work is blocked, with its reason', () => {
  let row = p(),
    s = session([row]);
  row.model = { offset: null, path: null, status: 'absent' };
  let r = classifyAddition(s, row);
  assert.equal(r.status, 'needs_test');
  assert.equal(r.available, true);
  assert.ok(r.checks.some(c => c.id === 'model' && c.status === 'info' && /memory/.test(c.detail)));
  // The tutorial's place in memory is a constant: no runtime map is needed to add to it.
  row = p();
  s = session([row]);
  s.has_runtime_map = false;
  assert.equal(classifyAddition(s, row).available, true);
  // Another level without a scene snapshot has no known place in memory.
  s.archive = 'level/Level_099_Nowhere.bld';
  r = classifyAddition(s, row);
  assert.equal(r.status, 'blocked');
  assert.match(r.reason, /scene snapshot/);
  s.archive = 'level/Level_027_Tutorial.bld';
  row.scale = 120;
  r = classifyAddition(s, row);
  assert.equal(r.status, 'blocked');
  assert.match(r.reason, /100%/);
});
test('families share actual model and script resources, not a display name', () => {
  const a = p(10, 'Barrel.ai'),
    b = p(20, 'Barrel.ai'),
    c = p(30, 'Different.ai');
  c.behavior.offset = 400;
  const groups = groupCandidates(session([a, b, c]));
  assert.equal(groups.length, 2);
  assert.equal(groups[0].members.length, 2);
});
test('a source verified in game is addable and says so, without being called confirmed', () => {
  const row = p(),
    s = session([row]);
  const r = classifyAddition(s, row, {
    report: { runtime: 'passed', visual: 'pending', launches: [{ run: 'a' }, { run: 'b' }] },
  });
  assert.equal(r.status, 'runtime_passed');
  assert.equal(r.label, 'Add · verified in game');
  assert.match(r.reason, /2 launch/);
  assert.equal(r.available, true);
  assert.equal(r.experimental, true);
  const failed = classifyAddition(s, row, {
    report: { runtime: 'failed', reason: 'Source guards have not passed yet.' },
  });
  assert.equal(failed.status, 'test_failed');
  assert.equal(failed.available, true, 'a failure is shown, it does not forbid another try');
});
test('a related source result and a transient object do not become confirmation', () => {
  const row = p(),
    s = session([row]);
  assert.equal(classifyAddition(s, row, { report: { source: 20, runtime: 'passed' } }).status, 'family_tested');
  assert.equal(
    classifyAddition(s, row, { report: { source: 10, runtime: 'inconclusive', reason: 'Object no longer present.' } })
      .status,
    'inconclusive',
  );
});
test('scripted recipes retain the exact script pointer and the static recipe stays unchanged', () => {
  const a = {
    id: -1,
    source: 3983352,
    model: 2794492,
    script: 2739632,
    position: [90, 10.5, 48],
    heading: 0,
    scale: 100,
  };
  assert.equal(compileNativePatch([a]).ini, compileNativeProbe([a]).ini);
  const p = compileNativeProbe([a]);
  assert.equal(p.hooks[0].words[(p.records_offset + 0x88) / 4], 0x80dbc020 + a.script);
  assert.throws(() => compileNativeProbe([{ ...a, script: -4 }]), /script offset/);
});
test('probe reports a disappeared or reused object as inconclusive, never a passed runtime check', async () => {
  const a = { id: -1, source: 10, model: 20 },
    payload = Buffer.alloc(0x1800),
    object = Buffer.alloc(0xf8);
  payload.writeUInt32BE(0x50464e41, 0);
  payload.writeUInt32BE(2, 4);
  payload.writeUInt32BE(0x81200000, 8);
  payload.writeInt32BE(-1, 0x1c);
  payload.writeUInt32BE(0x80dbc020 + 10, 0x2c);
  const result = await inspectProbe([a], async address => (address === 0x80001800 ? payload : object));
  assert.equal(result[0].runtime, 'inconclusive');
});

test('mixed additions preserve each independently compiled native hook and share the global capacity', () => {
  const flower = { id: -1, source: 3446244, model: 3446580, position: [88, 10.5, 43], heading: 0, scale: 100 };
  const barrel = {
    id: -2,
    source: 3983352,
    model: 2794492,
    script: 2739632,
    position: [90, 10.5, 48],
    heading: 0,
    scale: 100,
  };
  const a = compileNativePatch([flower]),
    b = compileNativePatch([barrel]),
    mixed = compileNativePatch([barrel, flower]);
  assert.deepEqual(mixed.hooks, [...a.hooks, ...b.hooks]);
  assert.deepEqual(mixed.lines, [...a.lines, ...b.lines]);
  assert.equal(mixed.count, 2);
  assert.ok(mixed.bytes <= 3256);
  assert.equal((mixed.ini.match(/\[Gecko_Enabled\]/g) || []).length, 1);
  assert.equal(compileNativeProbe([barrel, flower]).ini, mixed.ini);
  assert.throws(() => compileNativePatch([barrel, { ...flower, id: barrel.id }]), /distinct/);
  assert.throws(
    () => compileNativePatch([barrel, ...Array.from({ length: NATIVE_LIMIT }, (_, i) => ({ ...flower, id: -i - 3 }))]),
    new RegExp('1\\.\\.' + NATIVE_LIMIT),
  );
});
