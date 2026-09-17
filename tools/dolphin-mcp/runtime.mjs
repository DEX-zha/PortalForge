import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createConnection } from 'node:net';
import { randomUUID, createHash } from 'node:crypto';
export const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, '../..');
export const local = path.join(root, '.local');
export const official = 'C:/Users/romai/Desktop/dolphin-2606a-x64/Dolphin-x64/Dolphin.exe';
export const felk = path.join(local, 'dolphin-felk/Dolphin.exe');
export const profile = path.join(local, 'dolphin-user');
export const evidence = path.join(local, 'dolphin-evidence');
export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function portOccupied(port = 55355) {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const timer = setTimeout(() => finish(true), 1000);
    function finish(value) {
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    }
    socket.once('connect', () => finish(true));
    socket.once('error', error => finish(error.code !== 'ECONNREFUSED'));
  });
}

export function memoryRange(address, length) {
  if (
    !Number.isSafeInteger(address) ||
    !Number.isSafeInteger(length) ||
    length < 1 ||
    length > 65536 ||
    ![
      [0x80000000, 0x81800000],
      [0x90000000, 0x94000000],
    ].some(([s, e]) => address >= s && address + length <= e)
  )
    throw new Error('Range must fit within MEM1 or Wii MEM2, length 1..65536');
}
export function bridgeCall(method, params = [], timeout = 15000, port = 55355) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let data = Buffer.alloc(0),
      done = false;
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            'Dolphin bridge timeout: start a game and unpause the emulator. Operation outcome may be unknown; do not automatically retry writes.',
          ),
        ),
      timeout,
    );
    function finish(error, result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      error ? reject(error) : resolve(result);
    }
    socket.on('error', e => finish(e));
    socket.on('end', () => finish(new Error('Dolphin bridge disconnected before replying')));
    socket.on('connect', () => socket.write(JSON.stringify({ id: 1, method, params }) + '\n'));
    socket.on('data', chunk => {
      data = Buffer.concat([data, chunk]);
      if (data.length > 32 * 1024 * 1024) return finish(new Error('Bridge response exceeds limit'));
      const end = data.indexOf(10);
      if (end !== -1) {
        try {
          const r = JSON.parse(data.subarray(0, end));
          if (r.id !== 1) throw new Error('Invalid response ID');
          r.error ? finish(new Error(r.error)) : finish(null, r.result);
        } catch (e) {
          finish(e);
        }
      }
    });
  });
}
export function existingFile(filename) {
  const p = path.resolve(filename);
  if (!fs.statSync(p).isFile()) throw new Error('File required: ' + p);
  return p;
}
// Dolphin splits the patch XML path only on '/' (and ':' on Windows) to find the folder that
// relative 'external' files resolve against. A backslash path therefore yields the root "C:"
// and every file patch silently resolves to a missing file. Descriptor paths must use '/'.
export const dolphinPath = p => path.resolve(p).replace(/\\/g, '/');
export function buildDescriptor(game, xml, patchRoot, options) {
  return {
    type: 'dolphin-game-mod-descriptor',
    version: 1,
    'base-file': dolphinPath(existingFile(game)),
    'display-name': 'PortalForge experiment',
    riivolution: { patches: [{ xml: dolphinPath(existingFile(xml)), root: dolphinPath(patchRoot), options }] },
  };
}
export function initializeProfile() {
  fs.mkdirSync(path.join(profile, 'Config'), { recursive: true });
  fs.mkdirSync(evidence, { recursive: true });
  const defaults = {
    // UsePanicHandlers = False: Dolphin alert dialogs (e.g. missing Wii SSL certificates) would otherwise
    // pause emulation until a human clicks OK, which silences the bridge during automated runs.
    'Dolphin.ini':
      '[Analytics]\nEnabled = False\nPermissionAsked = True\n[Interface]\nConfirmStop = False\nPauseOnFocusLost = False\nUsePanicHandlers = False\n[Core]\nEnableSaveStates = True\n[EmulatedUSBDevices]\nEmulateSkylanderPortal = True\n',
    'Logger.ini':
      '[Options]\nWriteToFile = True\nWriteToConsole = False\nVerbosity = 4\n[Logs]\nBOOT = True\nCORE = True\nDISCIO = True\nFILEMON = True\nIOS_USB = True\nScripting = True\n',
    'WiimoteNew.ini':
      '[Wiimote1]\nSource = 1\nExtension = Nunchuk\n[Wiimote2]\nSource = 0\n[Wiimote3]\nSource = 0\n[Wiimote4]\nSource = 0\n',
  };
  for (const [name, content] of Object.entries(defaults)) {
    const p = path.join(profile, 'Config', name);
    if (!fs.existsSync(p)) fs.writeFileSync(p, content, { flag: 'wx' });
  }
}
let child = null;
export function ownedProcess() {
  return child && child.exitCode === null && !child.killed ? child : null;
}
export async function uiControl(operation, { file, slot = 1 } = {}) {
  const p = ownedProcess();
  if (!p) throw new Error('UI controls require a Dolphin process owned by this MCP');
  const args = [
    '-NoProfile',
    '-File',
    path.join(here, 'ui-control.ps1'),
    '-DolphinProcessId',
    String(p.pid),
    '-Operation',
    operation,
    '-Slot',
    String(slot),
  ];
  let copy = null;
  if (operation === 'load_figure') {
    const source = existingFile(file),
      data = fs.readFileSync(source);
    if (data.length !== 1024) throw new Error('Expected a 1024-byte SSA Skylander dump');
    const directory = path.join(local, 'figures');
    fs.mkdirSync(directory, { recursive: true });
    copy = {
      source,
      path: path.join(directory, randomUUID() + '.sky'),
      sha256: createHash('sha256').update(data).digest('hex'),
    };
    fs.writeFileSync(copy.path, data, { flag: 'wx' });
    args.push('-Filename', copy.path);
  }
  if (operation === 'save_state' || operation === 'load_state') args.push('-Filename', file);
  const { stdout } = await promisify(execFile)('powershell.exe', args, {
    windowsHide: true,
    timeout: 20000,
    encoding: 'utf8',
  });
  return { ...JSON.parse(stdout.trim()), ...(copy ? { copy } : {}) };
}
export async function launch({ game, runtime = 'felk' }) {
  if (ownedProcess()) throw new Error('This MCP already owns a running Dolphin. Stop it first.');
  if (runtime === 'felk' && (await portOccupied()))
    throw new Error(
      'Bridge port 55355 is already in use. Close the previous research Dolphin before launching another instance.',
    );
  if (!game && fs.existsSync(path.join(local, 'dolphin-config.json')))
    game = JSON.parse(fs.readFileSync(path.join(local, 'dolphin-config.json'), 'utf8')).game;
  initializeProfile();
  const executable = existingFile(runtime === 'felk' ? felk : official);
  const user = runtime === 'felk' ? profile : path.join(local, 'dolphin-official-user');
  fs.mkdirSync(user, { recursive: true });
  const args = ['--user', user];
  if (runtime === 'felk') args.push('--script', path.join(here, 'bridge.py'));
  if (game) args.push('--exec', existingFile(game));
  // Dolphin is the interactive application, so its game/Portal windows must be visible.
  // Background MCP and PowerShell helpers remain hidden.
  child = spawn(executable, args, { cwd: path.dirname(executable), windowsHide: false, stdio: 'ignore' });
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  const result = { pid: child.pid, executable, args, started_at: new Date().toISOString(), bridge_ready: false };
  fs.writeFileSync(path.join(evidence, 'last-launch.json'), JSON.stringify(result, null, 2));
  return result;
}
export async function stop() {
  const p = ownedProcess();
  if (!p) return { stopped: false, reason: 'No process owned by this MCP instance' };
  try {
    await promisify(execFile)(
      'powershell.exe',
      ['-NoProfile', '-File', path.join(here, 'close-window.ps1'), '-DolphinProcessId', String(p.pid)],
      { windowsHide: true, timeout: 5000 },
    );
  } catch {}
  for (let i = 0; i < 30 && p.exitCode === null && p.signalCode === null; i++) await delay(100);
  let forced = false;
  if (p.exitCode === null && p.signalCode === null) {
    forced = true;
    p.kill();
    await Promise.race([new Promise(r => p.once('exit', r)), delay(5000)]);
  }
  return { stopped: p.exitCode !== null || p.signalCode !== null, pid: p.pid, forced };
}
export function tailLog(lines = 100) {
  const filename = path.join(profile, 'Logs/dolphin.log');
  if (!fs.existsSync(filename)) return { filename, lines: [], exists: false };
  const fd = fs.openSync(filename, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - 262144);
    const b = Buffer.alloc(size - start);
    fs.readSync(fd, b, 0, b.length, start);
    return { filename, lines: b.toString('utf8').split(/\r?\n/).slice(-lines), exists: true };
  } finally {
    fs.closeSync(fd);
  }
}
