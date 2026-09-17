// Process and bridge runtime of the Dolphin MCP: launching the dedicated Dolphin, talking to the Python bridge
// loaded inside it, driving the native UI, and stopping it again.
//
// One rule runs through this file: the server only ever acts on the Dolphin process it started itself. The
// user's own installation is never launched implicitly, attached to, or stopped.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createConnection } from 'node:net';
import { randomUUID, createHash } from 'node:crypto';
import { setting, requireSetting } from './config.mjs';

const execFileAsync = promisify(execFile);

export const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, '../..');
export const local = path.join(root, '.local');
export const felk = path.join(local, 'dolphin-felk/Dolphin.exe');
export const profile = path.join(local, 'dolphin-user');
export const evidence = path.join(local, 'dolphin-evidence');

// The user's own Dolphin, only used when a launch asks for the `official` runtime explicitly.
export const officialDolphin = () => setting('official_dolphin');

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const BRIDGE_HOST = '127.0.0.1';
export const BRIDGE_PORT = 55355;
const BRIDGE_TIMEOUT_MS = 15000;
const BRIDGE_MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const PORT_PROBE_TIMEOUT_MS = 1000;
const NEWLINE = 10;

// Addressable guest memory: MEM1, then the Wii's MEM2.
const MEMORY_REGIONS = [
  [0x80000000, 0x81800000],
  [0x90000000, 0x94000000],
];
const MAX_READ_BYTES = 65536;

const FIGURE_DUMP_BYTES = 1024;
const UI_TIMEOUT_MS = 20000;
const CLOSE_WINDOW_TIMEOUT_MS = 5000;
const EXIT_POLL_MS = 100;
const EXIT_POLL_ATTEMPTS = 30;
const KILL_WAIT_MS = 5000;
const LOG_TAIL_BYTES = 262144;

// True when something already listens on the bridge port, which means a research Dolphin is still running.
export function portOccupied(port = BRIDGE_PORT) {
  return new Promise(resolve => {
    const socket = createConnection({ host: BRIDGE_HOST, port });
    const timer = setTimeout(() => finish(true), PORT_PROBE_TIMEOUT_MS);
    function finish(occupied) {
      clearTimeout(timer);
      socket.destroy();
      resolve(occupied);
    }
    socket.once('connect', () => finish(true));
    // Anything other than a refused connection means the port cannot be assumed free.
    socket.once('error', error => finish(error.code !== 'ECONNREFUSED'));
  });
}

// Throws unless [address, address + length) lies inside one guest memory region.
export function memoryRange(address, length) {
  const valid =
    Number.isSafeInteger(address) &&
    Number.isSafeInteger(length) &&
    length >= 1 &&
    length <= MAX_READ_BYTES &&
    MEMORY_REGIONS.some(([start, end]) => address >= start && address + length <= end);
  if (!valid) throw new Error('Range must fit within MEM1 or Wii MEM2, length 1..65536');
}

// One request/response exchange with the bridge: a JSON line out, a JSON line back.
export function bridgeCall(method, params = [], timeout = BRIDGE_TIMEOUT_MS, port = BRIDGE_PORT) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: BRIDGE_HOST, port });
    let received = Buffer.alloc(0);
    let done = false;

    function finish(error, result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(result);
    }

    // A timed-out write may still have happened, so the message says so rather than inviting a retry.
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            'Dolphin bridge timeout: start a game and unpause the emulator. Operation outcome may be unknown; do not automatically retry writes.',
          ),
        ),
      timeout,
    );

    socket.on('error', finish);
    socket.on('end', () => finish(new Error('Dolphin bridge disconnected before replying')));
    socket.on('connect', () => socket.write(JSON.stringify({ id: 1, method, params }) + '\n'));
    socket.on('data', chunk => {
      received = Buffer.concat([received, chunk]);
      if (received.length > BRIDGE_MAX_RESPONSE_BYTES) return finish(new Error('Bridge response exceeds limit'));
      const end = received.indexOf(NEWLINE);
      if (end === -1) return;
      try {
        const reply = JSON.parse(received.subarray(0, end));
        if (reply.id !== 1) throw new Error('Invalid response ID');
        if (reply.error) finish(new Error(reply.error));
        else finish(null, reply.result);
      } catch (e) {
        finish(e);
      }
    });
  });
}

export function existingFile(filename) {
  const resolved = path.resolve(filename);
  if (!fs.statSync(resolved).isFile()) throw new Error('File required: ' + resolved);
  return resolved;
}

// Dolphin splits the patch XML path only on '/' (and ':' on Windows) to find the folder that relative
// 'external' files resolve against. A backslash path therefore yields the root "C:" and every file patch
// silently resolves to a missing file. Descriptor paths must use '/'.
const dolphinPath = file => path.resolve(file).replace(/\\/g, '/');

export function buildDescriptor(game, xml, patchRoot, options) {
  return {
    type: 'dolphin-game-mod-descriptor',
    version: 1,
    'base-file': dolphinPath(existingFile(game)),
    'display-name': 'PortalForge experiment',
    riivolution: { patches: [{ xml: dolphinPath(existingFile(xml)), root: dolphinPath(patchRoot), options }] },
  };
}

const ini = lines => lines.join('\n') + '\n';

// Written once, when the research profile is created; an existing file is never overwritten.
const PROFILE_DEFAULTS = {
  // UsePanicHandlers = False: Dolphin alert dialogs (e.g. missing Wii SSL certificates) would otherwise pause
  // emulation until a human clicks OK, which silences the bridge during automated runs.
  'Dolphin.ini': ini([
    '[Analytics]',
    'Enabled = False',
    'PermissionAsked = True',
    '[Interface]',
    'ConfirmStop = False',
    'PauseOnFocusLost = False',
    'UsePanicHandlers = False',
    '[Core]',
    'EnableSaveStates = True',
    '[EmulatedUSBDevices]',
    'EmulateSkylanderPortal = True',
  ]),
  // FILEMON is the log the experiments read to prove which file the game actually consumed.
  'Logger.ini': ini([
    '[Options]',
    'WriteToFile = True',
    'WriteToConsole = False',
    'Verbosity = 4',
    '[Logs]',
    'BOOT = True',
    'CORE = True',
    'DISCIO = True',
    'FILEMON = True',
    'IOS_USB = True',
    'Scripting = True',
  ]),
  'WiimoteNew.ini': ini([
    '[Wiimote1]',
    'Source = 1',
    'Extension = Nunchuk',
    '[Wiimote2]',
    'Source = 0',
    '[Wiimote3]',
    'Source = 0',
    '[Wiimote4]',
    'Source = 0',
  ]),
};

export function initializeProfile() {
  fs.mkdirSync(path.join(profile, 'Config'), { recursive: true });
  fs.mkdirSync(evidence, { recursive: true });
  for (const [name, content] of Object.entries(PROFILE_DEFAULTS)) {
    const file = path.join(profile, 'Config', name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, content, { flag: 'wx' });
  }
}

// The Dolphin process this server started, or null. Nothing else is ever controlled.
let child = null;
export function ownedProcess() {
  return child && child.exitCode === null && !child.killed ? child : null;
}

const hasExited = process => process.exitCode !== null || process.signalCode !== null;

// The game only ever sees a copy of the figure: the original dump is never handed to the emulator.
function copyFigure(file) {
  const source = existingFile(file);
  const data = fs.readFileSync(source);
  if (data.length !== FIGURE_DUMP_BYTES) throw new Error('Expected a 1024-byte SSA Skylander dump');
  const directory = path.join(local, 'figures');
  fs.mkdirSync(directory, { recursive: true });
  const copy = {
    source,
    path: path.join(directory, randomUUID() + '.sky'),
    sha256: createHash('sha256').update(data).digest('hex'),
  };
  fs.writeFileSync(copy.path, data, { flag: 'wx' });
  return copy;
}

// Drives Dolphin's native interface through UI Automation. Needed where the scripting bridge cannot act:
// pause, save states, the emulated Portal and Wiimote reconnection.
export async function uiControl(operation, { file, slot = 1 } = {}) {
  const dolphin = ownedProcess();
  if (!dolphin) throw new Error('UI controls require a Dolphin process owned by this MCP');
  const args = [
    '-NoProfile',
    '-File',
    path.join(here, 'ui-control.ps1'),
    '-DolphinProcessId',
    String(dolphin.pid),
    '-Operation',
    operation,
    '-Slot',
    String(slot),
  ];

  let copy = null;
  if (operation === 'load_figure') {
    copy = copyFigure(file);
    args.push('-Filename', copy.path);
  }
  if (operation === 'save_state' || operation === 'load_state') args.push('-Filename', file);

  const { stdout } = await execFileAsync('powershell.exe', args, {
    windowsHide: true,
    timeout: UI_TIMEOUT_MS,
    encoding: 'utf8',
  });
  return { ...JSON.parse(stdout.trim()), ...(copy ? { copy } : {}) };
}

export async function launch({ game, runtime = 'felk' }) {
  if (ownedProcess()) throw new Error('This MCP already owns a running Dolphin. Stop it first.');
  const scripted = runtime === 'felk';
  if (scripted && (await portOccupied())) {
    throw new Error(
      `Bridge port ${BRIDGE_PORT} is already in use. Close the previous research Dolphin before launching another instance.`,
    );
  }
  if (!game) game = setting('game');
  initializeProfile();

  const executable = existingFile(scripted ? felk : requireSetting('official_dolphin'));
  const user = scripted ? profile : path.join(local, 'dolphin-official-user');
  fs.mkdirSync(user, { recursive: true });
  const args = ['--user', user];
  if (scripted) args.push('--script', path.join(here, 'bridge.py'));
  if (game) args.push('--exec', existingFile(game));

  // Dolphin is the interactive application, so its game and Portal windows must be visible. The MCP server
  // and the PowerShell helpers stay hidden.
  child = spawn(executable, args, { cwd: path.dirname(executable), windowsHide: false, stdio: 'ignore' });
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });

  const result = { pid: child.pid, executable, args, started_at: new Date().toISOString(), bridge_ready: false };
  fs.writeFileSync(path.join(evidence, 'last-launch.json'), JSON.stringify(result, null, 2));
  return result;
}

// Asks the window to close, waits, and only then kills. `forced` tells the caller which of the two happened,
// because a forced stop can leave a save state or a log half written.
export async function stop() {
  const dolphin = ownedProcess();
  if (!dolphin) return { stopped: false, reason: 'No process owned by this MCP instance' };
  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-File', path.join(here, 'close-window.ps1'), '-DolphinProcessId', String(dolphin.pid)],
      { windowsHide: true, timeout: CLOSE_WINDOW_TIMEOUT_MS },
    );
  } catch {
    // The polite close is best effort; the loop below waits, then the process is killed if it is still alive.
  }
  for (let i = 0; i < EXIT_POLL_ATTEMPTS && !hasExited(dolphin); i++) await delay(EXIT_POLL_MS);

  let forced = false;
  if (!hasExited(dolphin)) {
    forced = true;
    dolphin.kill();
    await Promise.race([new Promise(resolve => dolphin.once('exit', resolve)), delay(KILL_WAIT_MS)]);
  }
  return { stopped: hasExited(dolphin), pid: dolphin.pid, forced };
}

// The last lines of the profile's log, read from the end so a 100 MB log costs nothing.
export function tailLog(lines = 100) {
  const filename = path.join(profile, 'Logs/dolphin.log');
  if (!fs.existsSync(filename)) return { filename, lines: [], exists: false };
  const fd = fs.openSync(filename, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - LOG_TAIL_BYTES);
    const tail = Buffer.alloc(size - start);
    fs.readSync(fd, tail, 0, tail.length, start);
    return { filename, lines: tail.toString('utf8').split(/\r?\n/).slice(-lines), exists: true };
  } finally {
    fs.closeSync(fd);
  }
}
