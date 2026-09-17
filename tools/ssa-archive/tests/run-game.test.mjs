import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GameSession, defaultScript, readScript } from '../src/experiments/run-game.mjs';

test('file-monitor size parsing handles thin-space thousands separators and single digits', () => {
  assert.equal(
    GameSession.monitorSize(
      '07:52:396 Core\\HW\\DVD\\FileMonitor.cpp:86 W[FileMon]:  52 733 kB level/Level_027_Tutorial.arc',
    ),
    '52733 kB',
  );
  assert.equal(GameSession.normSize('52 735 kB'), GameSession.normSize('52735 kB'));
  assert.equal(
    GameSession.monitorSize('58:22:981 Core\\HW\\DVD\\FileMonitor.cpp:86 W[FileMon]:       0 kB hbm/config.txt'),
    '0 kB',
  );
  assert.equal(GameSession.monitorSize('no monitor here'), null);
});

test('both timeout flavours are recognised so loading stalls are tolerated, other errors are not', () => {
  assert.equal(
    GameSession.isTimeout(new Error('dolphin_frame_advance: frame_advance(120) timed out after 15000ms')),
    true,
  );
  assert.equal(
    GameSession.isTimeout(new Error('Dolphin bridge timeout: start a game and unpause the emulator.')),
    true,
  );
  assert.equal(GameSession.isTimeout(new Error('connect ECONNREFUSED 127.0.0.1:55355')), false);
});

test('the default level-entry script is well formed and never uses Plus (pause)', () => {
  assert.ok(fs.existsSync(defaultScript));
  const steps = readScript(defaultScript);
  assert.ok(steps.length > 10);
  for (const s of steps) {
    const keys = Object.keys(s).filter(k =>
      ['press', 'nunchuk', 'wait', 'wait_monitor', 'shot', 'figure', 'save_state'].includes(k),
    );
    assert.equal(keys.length, 1, `step must have exactly one action: ${JSON.stringify(s)}`);
    assert.notEqual(s.press, 'Plus', 'Plus pauses the game');
  }
  assert.ok(steps.some(s => s.wait_monitor === 'level/Level_027_Tutorial.arc'));
  assert.ok(steps.some(s => s.figure === '@figure'));
  assert.equal(path.basename(defaultScript), 'level-027-entry.json');
});
