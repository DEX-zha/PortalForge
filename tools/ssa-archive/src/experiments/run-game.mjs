// Shared in-game helpers for experiments, driven through the validated Dolphin MCP (M0 PASS).
// Rules (AGENTS.md, research.md R10): waits use frame_advance in chunks of <= 120 frames; a boot is
// never proof of anything; consumption is read from Dolphin's file monitor; every run stops its own
// Dolphin instance; the user's Dolphin 2606a is never touched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, '../../../..');
export const local = path.join(root, '.local');
export const evidence = path.join(local, 'dolphin-evidence');
export const experimentsDir = path.join(evidence, 'experiments');
export const mcpDir = path.join(root, 'tools', 'dolphin-mcp');
export const profileLog = path.join(local, 'dolphin-user', 'Logs', 'dolphin.log');
export const gameFromConfig = () => JSON.parse(fs.readFileSync(path.join(local, 'dolphin-config.json'), 'utf8')).game;
export const gateStatus = name => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'docs', `${name.toLowerCase()}-status.json`), 'utf8'));
  } catch {
    return { status: 'UNKNOWN' };
  }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

export class GameSession {
  constructor(log = console.log) {
    this.log = log;
    this.client = null;
    this.pid = null;
    this.logOffset = 0;
  }
  async connect() {
    this.client = new Client({ name: 'portalforge-ssa-archive', version: '0.1.0' });
    await this.client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [path.join(mcpDir, 'server.mjs')],
        stderr: 'inherit',
      }),
    );
    return this;
  }
  text(r) {
    return r.content.filter(x => x.type === 'text').map(x => x.text);
  }
  async call(name, args = {}) {
    if (name !== 'dolphin_stop') this.signal?.throwIfAborted();
    const r = await this.client.callTool({ name, arguments: args });
    if (r.isError) throw new Error(`${name}: ${this.text(r).join(' ')}`);
    return r;
  }
  async json(name, args = {}) {
    return JSON.parse(this.text(await this.call(name, args))[0]);
  }
  logSince(offset = this.logOffset) {
    if (!fs.existsSync(profileLog)) return '';
    const size = fs.statSync(profileLog).size;
    if (size <= offset) return '';
    const fd = fs.openSync(profileLog, 'r');
    try {
      const b = Buffer.alloc(size - offset);
      fs.readSync(fd, b, 0, b.length, offset);
      return b.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  }
  monitorLines(discPath) {
    const needle = discPath.replace(/^\/+/, '');
    return this.logSince()
      .split(/\r?\n/)
      .filter(l => l.includes('FileMon') && l.includes(needle))
      .map(l => l.trim());
  }
  // Normalised size token ("52733 kB"): Dolphin prints thin-space thousands separators.
  static monitorSize(line) {
    const m = /\]:\s+([\d\s]+)kB\s/.exec(line);
    return m ? m[1].replace(/\s+/g, '') + ' kB' : null;
  }
  static normSize(s) {
    return String(s ?? '').replace(/\s+/g, '');
  }

  // Boot a WBFS or a game-mod descriptor; wait for the bridge and the SSPP52 identity.
  async launch(target, label) {
    this.logOffset = fs.existsSync(profileLog) ? fs.statSync(profileLog).size : 0;
    const launched = await this.json('dolphin_launch', { game: target });
    this.pid = launched.pid;
    this.startedAt = new Date().toISOString();
    if (!launched.args.includes(path.resolve(target))) throw new Error(`${label}: launch did not use ${target}`);
    let connected = false;
    for (let i = 0; i < 40 && !connected; i++) {
      this.signal?.throwIfAborted();
      await sleep(1500);
      try {
        await this.call('dolphin_ping');
        connected = true;
      } catch {
        this.signal?.throwIfAborted(); /* booting */
      }
    }
    if (!connected) throw new Error(`${label}: live bridge did not respond after launch`);
    const id = this.text(await this.call('dolphin_read_range', { address: 0x80000000, length: 6 }))[0];
    if (!/SSPP52/.test(id) && !/53 53 50 50 35 32|535350503532/i.test(id))
      throw new Error(`${label}: unexpected game identity ${id}`);
    this.log(`${label}: pid ${this.pid}, bridge up`);
    return launched;
  }
  async stop() {
    if (!this.client || !this.pid) return null;
    try {
      const r = await this.json('dolphin_stop');
      if (r.stopped) this.log(`stopped pid ${r.pid} forced=${r.forced}`);
      this.pid = null;
      return r;
    } catch (e) {
      return { error: e.message };
    }
  }
  async close() {
    try {
      await this.client?.close();
    } catch {
      // The transport may already be closed; there is nothing left to release.
    }
  }

  // Wall-clock wait while emulation keeps running (frame_advance bounded to 15 s upstream).
  // Heavy disc loads (a 69 MB Title.arc) stall frames for many seconds: the bridge dispatches one
  // command per frame, so both "timed out" (upstream) and "bridge timeout" (runtime) are tolerated
  // until the game has been silent for `stallLimit` consecutive attempts, then treated as a hang.
  static isTimeout(e) {
    return /timed out|bridge timeout/i.test(e.message ?? '');
  }
  async waitSeconds(seconds, { stallLimit = 8 } = {}) {
    const deadline = Date.now() + seconds * 1000;
    let stalls = 0;
    while (Date.now() < deadline) {
      try {
        await this.call('dolphin_frame_advance', { frames: 120 });
        stalls = 0;
      } catch (e) {
        if (!GameSession.isTimeout(e)) throw e;
        if (++stalls >= stallLimit) {
          throw new Error(`emulation silent for ${stalls} consecutive waits: ${e.message}`, { cause: e });
        }
        await sleep(3000);
      }
    }
  }
  // Same stall tolerance as waitSeconds: the 500 MB permanent/global.arc load freezes frames for
  // well over a minute right after the Activision logo.
  async callWithRetry(name, args, attempts = 8) {
    for (let i = 1; ; i++) {
      try {
        return await this.call(name, args);
      } catch (e) {
        if (!GameSession.isTimeout(e) || i >= attempts) throw e;
        this.log(`  ${name}: emulation stalled (${i}/${attempts}), retrying`);
        await sleep(3000);
      }
    }
  }
  // Wait until the file monitor reports a disc path; returns the line or null on timeout.
  async waitMonitor(discPath, timeoutSeconds = 120) {
    const deadline = Date.now() + timeoutSeconds * 1000;
    while (Date.now() < deadline) {
      const lines = this.monitorLines(discPath);
      if (lines.length) return lines[lines.length - 1];
      await this.waitSeconds(2);
    }
    return null;
  }
  async press(button, frames = 3) {
    await this.callWithRetry('dolphin_hold_wii_input', { buttons: { [button]: true }, frames });
  }
  async nunchuk(stick, frames = 60) {
    await this.callWithRetry('dolphin_hold_wii_input', { nunchuk: stick, frames });
  }
  // A missed screenshot is recorded as null rather than aborting the run; the trace shows the gap.
  async screenshot(label) {
    let t;
    try {
      t = this.text(await this.callWithRetry('dolphin_screenshot'));
    } catch (e) {
      if (!GameSession.isTimeout(e)) throw e;
      this.log(`  screenshot ${label ?? ''} skipped: ${e.message.split('\n')[0]}`);
      return null;
    }
    const file = t[t.length - 1];
    if (label && file && fs.existsSync(file)) {
      const dest = path.join(path.dirname(file), `${label}.png`);
      fs.copyFileSync(file, dest);
      return dest;
    }
    return file;
  }
  // Native UI automation can miss the Portal dialog while the CPU is saturated; retry after a pause.
  async loadFigure(file, slot = 1, attempts = 3) {
    for (let i = 1; ; i++) {
      try {
        return await this.json('dolphin_load_figure', { file, slot });
      } catch (e) {
        this.signal?.throwIfAborted();
        if (i >= attempts) throw e;
        this.log(`figure load attempt ${i} failed: ${e.message.split('\n')[0]}; retrying`);
        await sleep(6000);
      }
    }
  }
  async saveState(slot) {
    return this.json('dolphin_save_state', { slot });
  }
  async loadState(slot) {
    return this.json('dolphin_load_state', { slot });
  }

  // Replay an input script: [{press, frames?} | {nunchuk:{StickX,StickY}, frames?} | {wait: seconds}
  //   | {wait_monitor: discPath, timeout?} | {shot: label} | {figure: file, slot?} | {save_state: slot}
  //   | {load_state: slot}]  restoring a state is the only way to reach a level the menus cannot walk to
  async runScript(steps, { labelPrefix = 'step', onShot = null, figure = null, onStep = null } = {}) {
    const trace = [];
    const push = t => {
      trace.push(t);
      if (onStep) onStep(t);
    };
    for (let i = 0; i < steps.length; i++) {
      const s = { ...steps[i] };
      const t0 = Date.now();
      let note = null;
      if (s.figure === '@figure') {
        if (!figure) {
          push({ step: i, ...s, skipped: 'no --figure given' });
          continue;
        }
        s.figure = figure;
      }
      if (s.press) await this.press(s.press, s.frames ?? 3);
      else if (s.nunchuk) await this.nunchuk(s.nunchuk, s.frames ?? 60);
      else if (s.wait) await this.waitSeconds(s.wait);
      else if (s.wait_monitor) {
        note = await this.waitMonitor(s.wait_monitor, s.timeout ?? 120);
        if (!note && s.required !== false) throw new Error(`file monitor never reported ${s.wait_monitor}`);
      } else if (s.shot) {
        note = await this.screenshot(`${labelPrefix}-${String(i).padStart(2, '0')}-${s.shot}`);
        if (onShot && note) await onShot(note);
        if (!note) note = 'screenshot skipped (stall)';
      } else if (s.figure) note = JSON.stringify(await this.loadFigure(s.figure, s.slot ?? 1));
      else if (s.save_state) note = JSON.stringify(await this.saveState(s.save_state));
      else if (s.load_state !== undefined) note = JSON.stringify(await this.loadState(s.load_state));
      push({ step: i, ...s, seconds: Math.round((Date.now() - t0) / 100) / 10, note });
      this.log(`  [${i}] ${JSON.stringify(s)} -> ${note ?? 'ok'} (${trace[trace.length - 1].seconds}s)`);
    }
    return trace;
  }
  // Wraps runScript so a failure still exposes the steps completed so far (e.trace).
  async runScriptSafe(steps, options) {
    const trace = [];
    const original = this.log;
    try {
      return await this.runScript(steps, {
        ...options,
        onStep: t => {
          trace.push(t);
          options?.onStep?.(t);
        },
      });
    } catch (e) {
      e.trace = trace;
      throw e;
    } finally {
      this.log = original;
    }
  }
}

export function readScript(file) {
  const p = path.resolve(file);
  const steps = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(steps)) throw new Error('input script must be a JSON array of steps');
  return steps;
}
export const defaultScript = path.join(here, 'input-scripts', 'level-027-entry.json');
