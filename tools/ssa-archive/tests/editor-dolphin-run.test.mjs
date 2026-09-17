import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runEditorGame } from '../src/editor/dolphin-run.mjs';

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-run-')),
    figure = path.join(dir, 'figure.sky');
  fs.writeFileSync(figure, Buffer.alloc(1024));
  const calls = [];
  const fake = {
    pid: 7,
    connect: async () => {},
    launch: async t => calls.push(['launch', t]),
    runScriptSafe: async (steps, opts) => {
      calls.push(['macro', steps]);
      opts.onStep?.({ step: 0 });
      return [{ figure: opts.figure }];
    },
    loadFigure: async f => calls.push(['figure', f]),
    screenshot: async () => null,
    monitorLines: () => ['01:02 W[FileMon]: 1234 kB level/Level_027_Tutorial.bld'],
    stop: async () => {
      calls.push(['stop']);
      return { stopped: true };
    },
    close: async () => calls.push(['close']),
    json: async () => ({ pid: null }),
  };
  return {
    dir,
    figure,
    calls,
    fake,
    patch: {
      descriptor: 'the-reviewed-patch.json',
      expected_monitor_sizes: { 'level/Level_027_Tutorial.bld': '1234 kB' },
      original_monitor_size: '1230 kB',
    },
  };
}
test('automatic test replays the figure macro against the exact patch and closes only its own session', async () => {
  const f = fixture();
  const r = await runEditorGame({
    ...f,
    mode: 'test',
    archive: 'level/Level_027_Tutorial.bld',
    gameFactory: () => f.fake,
    evidenceDir: f.dir,
  });
  assert.equal(f.calls[0][1], 'the-reviewed-patch.json');
  assert.ok(f.calls.some(c => c[0] === 'macro'));
  assert.ok(f.calls.some(c => c[0] === 'stop'));
  assert.equal(r.consumption.verified, true);
  assert.equal(r.visual_effect, 'UNJUDGED');
});
test('classic mode loads a figure but leaves the menus and movement to the player', async () => {
  const f = fixture();
  await runEditorGame({
    ...f,
    mode: 'play',
    archive: 'level/Level_027_Tutorial.bld',
    gameFactory: () => f.fake,
    evidenceDir: f.dir,
    pollMs: 0,
  });
  assert.ok(f.calls.some(c => c[0] === 'figure'));
  assert.ok(!f.calls.some(c => c[0] === 'macro'));
});

test('direct test restores before transition, proves current consumption and restores the slot after stopping', async () => {
  const f = fixture();
  const entryServices = {
    confirmed: () => true,
    prepare: async () => {
      f.calls.push(['prepare']);
      return { file: 'checkpoint' };
    },
    restore: async () => {
      f.calls.push(['restore-entry']);
      return { proof: { state_sha256: 'hash' }, restore: () => f.calls.push(['restore-slot']) };
    },
  };
  const r = await runEditorGame({
    ...f,
    mode: 'direct-test',
    archive: 'level/Level_027_Tutorial.bld',
    gameFactory: () => f.fake,
    evidenceDir: f.dir,
    entryServices,
  });
  assert.deepEqual(
    f.calls.map(c => c[0]),
    ['prepare', 'launch', 'restore-entry', 'macro', 'stop', 'close', 'restore-slot'],
  );
  assert.equal(r.consumption.verified, true);
  assert.equal(r.entry.state_sha256, 'hash');
  assert.equal(r.entry_slot_restored, true);
  const steps = f.calls.find(c => c[0] === 'macro')[1];
  assert.equal(steps[0].press, 'A');
  assert.ok(!steps.some(s => s.shot === 'title'));
});
test('direct entry refuses an unvalidated level or recipe before launch', async () => {
  const f = fixture();
  const args = {
    ...f,
    mode: 'direct-test',
    gameFactory: () => f.fake,
    evidenceDir: f.dir,
    entryServices: { confirmed: () => false },
  };
  await assert.rejects(runEditorGame({ ...args, archive: 'level/Level_000_Mining.bld' }), /not yet validated/);
  await assert.rejects(runEditorGame({ ...args, archive: 'level/Level_027_Tutorial.bld' }), /still being validated/);
  assert.deepEqual(f.calls, []);
});
test('direct play reaches the tutorial, leaves movement to the player and closes cleanly', async () => {
  const f = fixture(),
    entryServices = {
      confirmed: () => true,
      prepare: async () => ({}),
      restore: async () => ({ proof: {}, restore: () => f.calls.push(['restore-slot']) }),
    };
  const r = await runEditorGame({
    ...f,
    mode: 'direct-play',
    archive: 'level/Level_027_Tutorial.bld',
    gameFactory: () => f.fake,
    evidenceDir: f.dir,
    entryServices,
    pollMs: 0,
  });
  const steps = f.calls.find(c => c[0] === 'macro')[1];
  assert.equal(steps.at(-1).shot, 'tutorial-skylander');
  assert.ok(!steps.some(s => s.nunchuk));
  assert.equal(r.status, 'CLOSED');
  assert.equal(r.entry_slot_restored, true);
  assert.equal(r.consumption.verified, true);
});
test('skip selection reaches every automated launch mode and direct play hands off before movement', async () => {
  for (const mode of ['test', 'direct-test', 'direct-play']) {
    const f = fixture(),
      entryServices = {
        confirmed: () => true,
        prepare: async () => ({}),
        restore: async () => ({ proof: {}, restore: () => {} }),
      };
    const r = await runEditorGame({
      ...f,
      mode,
      skip_intro: true,
      archive: 'level/Level_027_Tutorial.bld',
      gameFactory: () => f.fake,
      evidenceDir: f.dir,
      entryServices,
      pollMs: 0,
    });
    const steps = f.calls.find(c => c[0] === 'macro')[1];
    assert.equal(r.skip_intro, true);
    assert.equal(steps.filter(s => s.nunchuk?.C).length, 1);
    assert.equal(r.consumption.verified, true);
    assert.equal(steps.at(-1).shot, mode === 'direct-play' ? 'tutorial-skylander' : 'tutorial-moved-left');
  }
});
test('a failed entry restore preserves its cleanup until the owned process stops', async () => {
  const f = fixture(),
    entryServices = {
      confirmed: () => true,
      prepare: async () => ({}),
      restore: async () => {
        throw Object.assign(Error('incompatible state'), { restoreEntry: () => f.calls.push(['restore-slot']) });
      },
    };
  await assert.rejects(
    runEditorGame({
      ...f,
      mode: 'direct-test',
      archive: 'level/Level_027_Tutorial.bld',
      gameFactory: () => f.fake,
      evidenceDir: f.dir,
      entryServices,
    }),
    /incompatible state/,
  );
  assert.deepEqual(
    f.calls.map(c => c[0]),
    ['launch', 'stop', 'close', 'restore-slot'],
  );
});
test('a macro failure still stops its owned game and writes evidence', async () => {
  const f = fixture();
  f.fake.runScriptSafe = async () => {
    throw Error('macro failed');
  };
  await assert.rejects(
    runEditorGame({
      ...f,
      mode: 'test',
      archive: 'level/Level_027_Tutorial.bld',
      gameFactory: () => f.fake,
      evidenceDir: f.dir,
    }),
    /macro failed/,
  );
  assert.ok(f.calls.some(c => c[0] === 'stop'));
  assert.ok(fs.readdirSync(f.dir).some(n => n.endsWith('.json')));
});

test('a denied MCP process reports how to restart the editor and preserves failure evidence without launching Dolphin', async () => {
  const f = fixture();
  f.fake.pid = null;
  f.fake.connect = async () => {
    throw Object.assign(new Error('spawn EPERM'), { code: 'EPERM' });
  };
  await assert.rejects(
    runEditorGame({
      ...f,
      mode: 'test',
      archive: 'level/Level_027_Tutorial.bld',
      gameFactory: () => f.fake,
      evidenceDir: f.dir,
    }),
    e => {
      assert.equal(e.code, 'EPERM');
      assert.match(e.message, /MCP server/);
      assert.match(e.message, /Windows terminal/);
      assert.match(e.message, /spawn EPERM/);
      return true;
    },
  );
  assert.deepEqual(f.calls, [['close']]);
  const record = JSON.parse(
    fs.readFileSync(
      path.join(
        f.dir,
        fs.readdirSync(f.dir).find(n => n.endsWith('.json')),
      ),
    ),
  );
  assert.equal(record.status, 'FAILED');
  assert.equal(record.error_code, 'EPERM');
  assert.equal(record.failed_stage, 'mcp-connect');
  assert.equal(record.consumption.verified, false);
  assert.equal(record.visual_effect, 'UNJUDGED');
});

test('an abort before launch returns its PID still closes the subsequently owned process', async () => {
  const f = fixture(),
    controller = new AbortController();
  f.fake.pid = null;
  f.fake.launch = async () => {
    controller.abort();
    f.fake.pid = 42;
    controller.signal.throwIfAborted();
  };
  const r = await runEditorGame({
    ...f,
    mode: 'test',
    archive: 'level/Level_027_Tutorial.bld',
    signal: controller.signal,
    gameFactory: () => f.fake,
    evidenceDir: f.dir,
  });
  assert.equal(r.status, 'STOPPED');
  assert.ok(f.calls.some(c => c[0] === 'stop'));
});
