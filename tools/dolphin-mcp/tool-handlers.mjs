// Handlers for the tools this server implements itself. Anything not listed here is forwarded to the upstream
// `mcp-dolphin` implementation, which talks to the same bridge.
//
// Each handler receives the validated arguments and returns a plain value; the server wraps it into an MCP
// result and writes the audit line.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  bridgeCall,
  buildDescriptor,
  delay,
  evidence,
  existingFile,
  felk,
  initializeProfile,
  launch,
  officialDolphin,
  ownedProcess,
  profile,
  root,
  stop,
  tailLog,
  uiControl,
} from './runtime.mjs';

const STATUS_PING_TIMEOUT_MS = 1500;
const GAME_ID_ADDRESS = 0x80000000; // the six-character disc ID sits at the start of MEM1
const GAME_ID_BYTES = 6;
const STATE_POLL_MS = 100;
const STATE_POLL_ATTEMPTS = 100;
const MAX_U64 = 0xffffffffffffffffn;

const LIMITATIONS = [
  'No exact stepping; frame_advance waits at least N frames within a 15 s bound (wait in chunks of ~120 frames during loading)',
  'Pause/resume, state, Portal and Wiimote-connection tools require owned process and interactive Windows desktop (French/English UI)',
  'Bridge dispatch stops during native pause',
  'Game-mod descriptor paths must use forward slashes; a booting descriptor does not prove a file was replaced',
];

// Gate status is maintained by humans in docs/m0-status.json together with docs/mcp/dolphin-mcp.md.
function gateStatus() {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'docs', 'm0-status.json'), 'utf8'));
  } catch (e) {
    return { status: 'NOT_VALIDATED', reason: 'docs/m0-status.json unreadable: ' + e.message };
  }
}

const runtimeStatus = file => ({ path: file, exists: !!file && fs.existsSync(file) });

async function status() {
  let bridge = null;
  let reason = null;
  try {
    bridge = await bridgeCall('bridge.ping', [], STATUS_PING_TIMEOUT_MS);
  } catch (e) {
    reason = e.message;
  }
  return {
    runtimes: { official: runtimeStatus(officialDolphin()), felk: runtimeStatus(felk) },
    pid: ownedProcess()?.pid ?? null,
    profile,
    bridge,
    reason,
    limitations: LIMITATIONS,
    M0: gateStatus(),
  };
}

function buildPatchLaunch(args) {
  if (!fs.statSync(args.patch_root).isDirectory()) throw new Error('Patch root must be a directory');
  const descriptor = buildDescriptor(args.game, args.xml, args.patch_root, args.options);
  initializeProfile();
  const output = path.join(evidence, 'patch-' + randomUUID() + '.json');
  fs.writeFileSync(output, JSON.stringify(descriptor, null, 2), { flag: 'wx' });
  // The descriptor is well formed; whether the game consumes the replacement is for the file monitor to say.
  return { output, descriptor, engine_validation: 'PENDING' };
}

function write64(args) {
  const value = BigInt(args.value);
  if (value < 0n || value > MAX_U64) throw new Error('unsigned 64-bit value required');
  // JSON cannot carry a 64-bit integer exactly, so it travels as decimal text.
  return bridgeCall('memory.write_u64', [args.address, value.toString()]);
}

async function stateFileFor(slot) {
  const id = Buffer.from(await bridgeCall('memory.read_bytes', [GAME_ID_ADDRESS, GAME_ID_BYTES]), 'hex').toString(
    'ascii',
  );
  if (!/^[A-Z0-9]{6}$/.test(id)) throw new Error('A disc game ID is required for state-file verification');
  return path.join(profile, 'StateSaves', `${id}.s${String(slot).padStart(2, '0')}`);
}

// Waits until the state file is newer than it was before the save was requested.
async function waitForStateFile(filename, previousMtime) {
  for (let i = 0; i < STATE_POLL_ATTEMPTS; i++) {
    await delay(STATE_POLL_MS);
    if (!fs.existsSync(filename)) continue;
    const stat = fs.statSync(filename);
    if (stat.size > 0 && stat.mtimeMs > previousMtime) return;
  }
  throw new Error('Save was scheduled but completed state file was not observed: ' + filename);
}

// Saving through the scripting API fails mid-game, so both directions go through the native interface. A save
// is verified by the file it writes; a load can only be scheduled, and has to be observed afterwards.
async function saveState(args) {
  const filename = await stateFileFor(args.slot);
  const previousMtime = fs.existsSync(filename) ? fs.statSync(filename).mtimeMs : 0;
  const backup = previousMtime ? path.join(evidence, 'state-backup-' + randomUUID() + '.sav') : null;
  if (backup) fs.copyFileSync(filename, backup, fs.constants.COPYFILE_EXCL);
  await uiControl('save_state', { slot: args.slot });
  await waitForStateFile(filename, previousMtime);
  return { filename, backup, operation: 'saved_file_verified', bytes: fs.statSync(filename).size };
}

async function loadState(args) {
  const filename = existingFile(await stateFileFor(args.slot));
  await uiControl('load_state', { slot: args.slot });
  return { filename, backup: null, operation: 'load_scheduled', bytes: fs.statSync(filename).size };
}

export const HANDLERS = {
  dolphin_connect_wiimote: args => uiControl('connect_wiimote', { slot: (args.port ?? 0) + 1 }),
  dolphin_pause: () => uiControl('pause'),
  dolphin_resume: () => uiControl('resume'),
  dolphin_load_figure: args => uiControl('load_figure', args),
  dolphin_remove_figure: args => uiControl('remove_figure', args),
  dolphin_status: status,
  dolphin_launch: args => launch(args),
  dolphin_stop: () => stop(),
  dolphin_logs: args => tailLog(args.lines ?? 100),
  dolphin_build_patch_launch: buildPatchLaunch,
  dolphin_hold_wii_input: args =>
    bridgeCall('controller.hold', [args.port ?? 0, args.buttons ?? {}, args.nunchuk ?? {}, args.frames]),
  dolphin_get_wii_input: async args => ({
    buttons: await bridgeCall('controller.get_wiimote_buttons', [args.port ?? 0]),
    nunchuk: await bridgeCall('controller.get_wii_nunchuk_buttons', [args.port ?? 0]),
  }),
  dolphin_read_float: args => bridgeCall('memory.read_f' + (args.bits ?? 32), [args.address]),
  dolphin_write_float: args => bridgeCall('memory.write_f' + (args.bits ?? 32), [args.address, args.value]),
  dolphin_write64: write64,
  dolphin_save_state: saveState,
  dolphin_load_state: loadState,
};
