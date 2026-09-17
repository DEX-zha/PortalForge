import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { here, local, evidence, delay } from './runtime.mjs';
import { requireSetting } from './config.mjs';
const c = new Client({ name: 'portalforge-live-test', version: '0.1.0' });
const report = { started: new Date().toISOString(), checks: [] };
async function call(name, args = {}) {
  const r = await c.callTool({ name, arguments: args });
  if (r.isError) throw new Error(name + ': ' + JSON.stringify(r));
  return r;
}
try {
  await c.connect(
    new StdioClientTransport({ command: process.execPath, args: [path.join(here, 'server.mjs')], stderr: 'inherit' }),
  );
  let game = requireSetting('game');
  if (process.argv.includes('--patch')) {
    const patch = await call('dolphin_build_patch_launch', {
      game,
      xml: path.join(local, 'riivolution-smoke/smoke.xml'),
      patch_root: path.join(local, 'riivolution-smoke'),
      options: [{ 'option-id': 'mcp-smoke', choice: 1 }],
    });
    game = JSON.parse(patch.content[0].text).output;
    report.patch_descriptor = game;
  }
  const launched = await call('dolphin_launch', { game });
  console.log(JSON.stringify(launched));
  let connected = false;
  for (let i = 0; i < 12; i++) {
    await delay(1500);
    try {
      const ping = await call('dolphin_ping');
      console.log(JSON.stringify(ping));
      connected = true;
      break;
    } catch (e) {
      console.log(e.message);
    }
  }
  assert.ok(connected, 'Live bridge must respond');
  report.checks.push({ name: 'live_bridge', status: 'PASS' });
  const original = await call('dolphin_read64', { address: 0x80000000 });
  const exact = original.content[0].text.match(/: (\d+) /)[1];
  await call('dolphin_write64', { address: 0x80000000, value: exact });
  const after = await call('dolphin_read64', { address: 0x80000000 });
  assert.equal(original.content[0].text, after.content[0].text);
  report.checks.push({ name: 'write64_same_bytes_readback', status: 'PASS', value: exact });
  for (const [name, args] of [
    ['dolphin_read_range', { address: 0x80000000, length: 32 }],
    ['dolphin_read64', { address: 0x80000000 }],
    ['dolphin_get_wii_input', {}],
    ['dolphin_frame_advance', { frames: 300 }],
    ['dolphin_hold_wii_input', { buttons: { A: true }, nunchuk: { StickX: 0, StickY: 0 }, frames: 10 }],
    ['dolphin_frame_advance', { frames: 300 }],
    ['dolphin_screenshot', {}],
    ['dolphin_save_state', { slot: 9 }],
    ['dolphin_frame_advance', { frames: 60 }],
    ['dolphin_load_state', { slot: 9 }],
    ['dolphin_frame_advance', { frames: 60 }],
    ['dolphin_screenshot', {}],
    ['dolphin_logs', { lines: 25 }],
  ]) {
    try {
      const result = await call(name, args);
      const text = result.content.filter(x => x.type === 'text');
      console.log(JSON.stringify({ name, result: text }));
      report.checks.push({ name, status: 'PASS', result: text });
    } catch (e) {
      console.log(e.message);
      report.checks.push({ name, status: 'FAIL', error: e.message });
      process.exitCode = 1;
    }
  }
} catch (e) {
  report.error = e.message;
  console.error(e);
  process.exitCode = 1;
} finally {
  try {
    console.log(JSON.stringify(await call('dolphin_stop')));
  } catch {
    // Best effort: the instance may already be gone, and the report below records what happened.
  }
  await c.close();
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(
    path.join(evidence, process.argv.includes('--patch') ? 'patch-test.json' : 'live-test.json'),
    JSON.stringify(report, null, 2),
  );
}
