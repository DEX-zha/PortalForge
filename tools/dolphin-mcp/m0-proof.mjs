// M0 Riivolution proof through the MCP: a control boot of the plain dump, then a boot of the
// patched descriptor. Dolphin's file monitor logs the size served for /hbm/config.txt from the
// active disc file system; a changed size proves the external file replaced the disc file.
// Then the patched game must still reach a rendered scene and accept a figure via the MCP.
// Read-only towards the game dump; writes only evidence files and the proof manifest.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { here, local, evidence, profile, delay, bridgeCall } from './runtime.mjs';
import { requireSetting } from './config.mjs';

const proofDirectory = path.join(local, 'riivolution-proof');
const manifestPath = path.join(proofDirectory, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const game = requireSetting('game');
const figure = process.argv[2] ?? requireSetting('figure');
const logFile = path.join(profile, 'Logs', 'dolphin.log');
const report = {
  started: new Date().toISOString(),
  descriptor: manifest.descriptor,
  disc_path: manifest.disc_path,
  checks: [],
};
const c = new Client({ name: 'portalforge-m0-proof', version: '0.1.0' });
const text = r => r.content.filter(x => x.type === 'text').map(x => x.text);
async function call(name, args = {}) {
  const r = await c.callTool({ name, arguments: args });
  if (r.isError) throw new Error(name + ': ' + text(r).join(' '));
  return r;
}
function pass(name, detail = {}) {
  report.checks.push({ name, status: 'PASS', ...detail });
  console.log('PASS ' + name + ' ' + JSON.stringify(detail));
}
// frame_advance is bounded to 15 s upstream; boot-time loading runs below 60 fps, so wait in chunks.
async function advance(frames) {
  for (let done = 0; done < frames; done += 120)
    await call('dolphin_frame_advance', { frames: Math.min(120, frames - done) });
}
function logSince(offset) {
  if (!fs.existsSync(logFile)) return '';
  const size = fs.statSync(logFile).size;
  if (size <= offset) return '';
  const fd = fs.openSync(logFile, 'r');
  try {
    const b = Buffer.alloc(size - offset);
    fs.readSync(fd, b, 0, b.length, offset);
    return b.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}
// Boot one game through the MCP and return the file monitor line for the probed disc path.
async function bootAndObserve(label, target) {
  const offset = fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
  const launched = JSON.parse(text(await call('dolphin_launch', { game: target }))[0]);
  assert.ok(launched.args.includes(path.resolve(target)), label + ': launch must use the requested target');
  let connected = false;
  for (let i = 0; i < 30 && !connected; i++) {
    await delay(1500);
    try {
      await call('dolphin_ping');
      connected = true;
    } catch (e) {
      console.log(label + ' waiting bridge: ' + e.message);
    }
  }
  assert.ok(connected, label + ': live bridge must respond');
  const id = Buffer.from(await bridgeCall('memory.read_bytes', [0x80000000, 6]), 'hex').toString('ascii');
  assert.equal(id, 'SSPP52', label + ': boot must identify SSPP52');
  let line = null;
  for (let i = 0; i < 40 && !line; i++) {
    line = logSince(offset)
      .split(/\r?\n/)
      .find(l => l.includes('FileMon') && l.includes('hbm/config.txt'));
    if (!line) await call('dolphin_frame_advance', { frames: 60 });
  }
  assert.ok(line, label + ': file monitor never reported ' + manifest.disc_path);
  const size = /\]:\s+([\d\s\u00a0]+kB)\s+hbm\/config\.txt/
    .exec(line)?.[1]
    ?.replace(/[\s\u00a0]+/g, ' ')
    .trim();
  return { pid: launched.pid, line: line.trim(), size, log_offset: offset };
}
try {
  await c.connect(
    new StdioClientTransport({ command: process.execPath, args: [path.join(here, 'server.mjs')], stderr: 'inherit' }),
  );

  const control = await bootAndObserve('control', game);
  report.control = control;
  assert.equal(
    control.size,
    manifest.expected_original_log.split(' hbm')[0],
    'control run must serve the original size',
  );
  pass('control_original_size', { size: control.size });
  report.control.stop = JSON.parse(text(await call('dolphin_stop'))[0]);
  assert.ok(report.control.stop.stopped, 'control instance must stop before the patched boot');
  await delay(2000);

  const patched = await bootAndObserve('patched', manifest.descriptor);
  report.patched = patched;
  assert.equal(
    patched.size,
    manifest.expected_patched_log.split(' hbm')[0],
    'patched run must serve the replacement size',
  );
  assert.notEqual(patched.size, control.size);
  pass('patched_replacement_size', {
    control: control.size,
    patched: patched.size,
    replacement_bytes: manifest.replacement_size,
  });

  // The patched game must still run: reach a rendered scene and accept a figure through the MCP.
  await advance(600);
  const boot = text(await call('dolphin_screenshot'));
  report.patched.boot_screenshot = boot[boot.length - 1];
  pass('patched_game_renders', { file: report.patched.boot_screenshot });
  const loaded = JSON.parse(text(await call('dolphin_load_figure', { file: figure, slot: 1 }))[0]);
  report.patched.figure = loaded;
  pass('figure_loaded_via_mcp', { slot: loaded.slot, after: loaded.after, copy_sha256: loaded.copy?.sha256 });
  await advance(300);
  const shot = text(await call('dolphin_screenshot'));
  report.patched.figure_screenshot = shot[shot.length - 1];
  pass('screenshot_after_figure', { file: report.patched.figure_screenshot });
  report.patched.log_excerpt = logSince(patched.log_offset)
    .split(/\r?\n/)
    .filter(l => /FileMon|Skylander|Portal|1430:0150/i.test(l))
    .slice(-40);
  report.status = 'PASS';
} catch (e) {
  report.status = 'FAIL';
  report.error = e.message;
  console.error(e);
  process.exitCode = 1;
} finally {
  try {
    report.final_stop = JSON.parse(text(await call('dolphin_stop'))[0]);
  } catch (e) {
    report.final_stop = { error: e.message };
  }
  await c.close();
  report.finished = new Date().toISOString();
  fs.mkdirSync(evidence, { recursive: true });
  const output = path.join(evidence, 'm0-proof.json');
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  manifest.validation = report.status;
  manifest.validated_at = report.finished;
  manifest.report = output;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ status: report.status, output, error: report.error ?? null }));
}
