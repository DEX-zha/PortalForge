import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { registerTools } from './node_modules/mcp-dolphin/dist/tools.js';
import Ajv from 'ajv';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  bridgeCall,
  memoryRange,
  existingFile,
  buildDescriptor,
  launch,
  stop,
  ownedProcess,
  tailLog,
  official,
  felk,
  profile,
  evidence,
  delay,
  initializeProfile,
  uiControl,
  root,
} from './runtime.mjs';

// Gate status is maintained by humans in docs/m0-status.json together with docs/mcp/dolphin-mcp.md.
function gateStatus() {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'docs', 'm0-status.json'), 'utf8'));
  } catch (e) {
    return { status: 'NOT_VALIDATED', reason: 'docs/m0-status.json unreadable: ' + e.message };
  }
}

const handlers = [];
registerTools({ setRequestHandler: (_schema, handler) => handlers.push(handler) }, { call: bridgeCall });
const [upstreamList, upstreamCall] = handlers;
const ok = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const int = (min, max) => ({ type: 'integer', minimum: min, maximum: max });
const str = { type: 'string', minLength: 1 };
const schema = (properties = {}, required = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const buttons = Object.fromEntries(
  ['A', 'B', 'One', 'Two', 'Plus', 'Minus', 'Home', 'Up', 'Down', 'Left', 'Right'].map(k => [k, { type: 'boolean' }]),
);
const nunchuk = schema({
  C: { type: 'boolean' },
  Z: { type: 'boolean' },
  StickX: { type: 'number', minimum: -1, maximum: 1 },
  StickY: { type: 'number', minimum: -1, maximum: 1 },
});
const extra = [
  {
    name: 'dolphin_connect_wiimote',
    description:
      'Connect an enabled emulated Wii Remote through native UI if disconnected. Port 0..3; does not toggle an already connected remote off. Useful after state loading or inactivity.',
    inputSchema: schema({ port: int(0, 3) }),
  },
  {
    name: 'dolphin_pause',
    description:
      'Pause the owned Dolphin using native Windows UI, verified by toolbar state. Bridge calls cannot run while paused; use dolphin_resume.',
    inputSchema: schema(),
  },
  {
    name: 'dolphin_resume',
    description: 'Resume the owned Dolphin through Windows UI, including when the Python bridge is paused.',
    inputSchema: schema(),
  },
  {
    name: 'dolphin_load_figure',
    description:
      'Copy a supplied 1024-byte SSA figure into the isolated workspace, then load the copy into Portal slot 1..16. Never exposes the original to game writes. Reports UI slot; observe recognition in game separately. Requires an interactive Windows desktop, French or English Dolphin UI.',
    inputSchema: schema({ file: str, slot: int(1, 16) }, ['file']),
  },
  {
    name: 'dolphin_remove_figure',
    description: 'Remove a figure from Portal slot 1..16 of the owned Dolphin without deleting its file.',
    inputSchema: schema({ slot: int(1, 16) }),
  },
  {
    name: 'dolphin_status',
    description:
      'Inspect configured runtimes, owned process, and live bridge. Connection alone does not validate SSA or M0.',
    inputSchema: schema(),
  },
  {
    name: 'dolphin_launch',
    description:
      'Launch a separate project Dolphin profile. Optional game is an absolute WBFS/ISO/DOL or validated game-mod JSON path. Felk starts the bridge automatically. Official runtime is baseline only.',
    inputSchema: schema({ game: str, runtime: { type: 'string', enum: ['felk', 'official'] } }),
  },
  {
    name: 'dolphin_stop',
    description:
      'Stop only the Dolphin process launched by this MCP instance. Live unsaved state is lost; never stops other Dolphin instances.',
    inputSchema: schema(),
  },
  {
    name: 'dolphin_logs',
    description: 'Read the most recent project-profile Dolphin log lines. Missing logs are reported explicitly.',
    inputSchema: schema({ lines: int(1, 1000) }),
  },
  {
    name: 'dolphin_build_patch_launch',
    description:
      'Create a Dolphin game-mod JSON descriptor from an existing Riivolution XML and explicit choices. Paths are written with forward slashes because Dolphin resolves relative external files from the XML folder only with / separators. Does not prove replacements took effect: compare the file monitor size or content for the target disc file. Output is in local evidence; original game is read-only.',
    inputSchema: schema(
      {
        game: str,
        xml: str,
        patch_root: str,
        options: {
          type: 'array',
          items: schema({ 'section-name': str, 'option-id': str, 'option-name': str, choice: int(0, 999) }, ['choice']),
        },
      },
      ['game', 'xml', 'patch_root', 'options'],
    ),
  },
  {
    name: 'dolphin_hold_wii_input',
    description:
      'Apply Wii Remote and Nunchuk inputs once per emulated frame for 1..600 frames. Stick units -1..1. Values stop being overridden after the requested duration. Requires running emulation.',
    inputSchema: schema({ port: int(0, 3), buttons: schema(buttons), nunchuk, frames: int(1, 600) }, ['frames']),
  },
  {
    name: 'dolphin_get_wii_input',
    description: 'Read current emulated Wii Remote and Nunchuk state for a port.',
    inputSchema: schema({ port: int(0, 3) }),
  },
  {
    name: 'dolphin_read_float',
    description: 'Read a big-endian IEEE-754 float from MEM1/MEM2. Unaligned reads use exact bytes.',
    inputSchema: schema({ address: int(0, 0xffffffff), bits: { type: 'integer', enum: [32, 64] } }, ['address']),
  },
  {
    name: 'dolphin_write_float',
    description:
      'Write a big-endian IEEE-754 float to MEM1/MEM2, returning previous and new bytes. Changes live game state.',
    inputSchema: schema(
      { address: int(0, 0xffffffff), bits: { type: 'integer', enum: [32, 64] }, value: { type: 'number' } },
      ['address', 'value'],
    ),
  },
];
const tools = (await upstreamList()).tools;
for (const tool of tools) {
  if (tool.name.includes('state') && tool.inputSchema.properties?.slot) {
    tool.inputSchema.properties.slot.minimum = 1;
    tool.inputSchema.properties.slot.maximum = 10;
    tool.description =
      'Use native Dolphin UI to ' +
      (tool.name.includes('save') ? 'save' : 'load') +
      ' a state in the isolated profile, slot 1..10. Requires owned Dolphin, running game and interactive Windows desktop. Saves verify a newly written file; loads require subsequent observation. Same build and same patched game required.';
  }
  if (tool.name === 'dolphin_frame_advance')
    tool.description =
      'Wait for AT LEAST N further frames while emulation runs. This is not exact stepping and does not pause the emulator. Times out if stopped or paused.';
  if (tool.name === 'dolphin_screenshot')
    tool.description =
      'Return the latest rendered frame as PNG. Requires the bridge to be responsive and game running; GUI pause prevents requests.';
  if (tool.name === 'dolphin_set_wiimote_acceleration') {
    tool.description = 'Override Wii Remote acceleration for the current frame, in metres/second squared (m/s²).';
    for (const k of ['x', 'y', 'z']) tool.inputSchema.properties[k].description = 'Acceleration in m/s²';
  }
  if (tool.name === 'dolphin_press_gc_buttons') {
    tool.description =
      'Override supplied GC controls for the current frame. Sticks -1..1, triggers 0..1; omitted inputs are not overridden.';
    const props = {};
    for (const k of ['A', 'B', 'X', 'Y', 'Z', 'Start', 'L', 'R', 'Up', 'Down', 'Left', 'Right'])
      props[k] = { type: 'boolean' };
    for (const k of ['StickX', 'StickY', 'CStickX', 'CStickY']) props[k] = { type: 'number', minimum: -1, maximum: 1 };
    for (const k of ['TriggerLeft', 'TriggerRight']) props[k] = { type: 'number', minimum: 0, maximum: 1 };
    tool.inputSchema.properties.state = schema(props);
  }
}
tools.push(...extra);
const ajv = new Ajv({ strict: false });
const validators = new Map(tools.map(t => [t.name, ajv.compile(t.inputSchema)]));
const server = new Server({ name: 'portalforge-dolphin', version: '0.1.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
// Serialize tool operations so inputs, mutations and launches do not interleave.
let queue = Promise.resolve();
server.setRequestHandler(CallToolRequestSchema, req => {
  const task = queue.then(() => call(req));
  queue = task.catch(() => {});
  return task;
});
async function call(req) {
  const { name, arguments: a = {} } = req.params;
  try {
    const validate = validators.get(name);
    if (!validate) throw new Error('Unknown tool: ' + name);
    if (!validate(a)) throw new Error(ajv.errorsText(validate.errors));
    let result;
    if (a.address !== undefined) {
      const width = /\d+$/.exec(name)?.[0];
      memoryRange(a.address, a.length ?? (width ? Number(width) / 8 : (a.bits ?? 32) / 8));
    }
    switch (name) {
      case 'dolphin_connect_wiimote':
        result = ok(await uiControl('connect_wiimote', { slot: (a.port ?? 0) + 1 }));
        break;
      case 'dolphin_pause':
        result = ok(await uiControl('pause'));
        break;
      case 'dolphin_resume':
        result = ok(await uiControl('resume'));
        break;
      case 'dolphin_load_figure':
        result = ok(await uiControl('load_figure', a));
        break;
      case 'dolphin_remove_figure':
        result = ok(await uiControl('remove_figure', a));
        break;
      case 'dolphin_status': {
        let live = null,
          reason = null;
        try {
          live = await bridgeCall('bridge.ping', [], 1500);
        } catch (e) {
          reason = e.message;
        }
        result = ok({
          runtimes: {
            official: { path: official, exists: fs.existsSync(official) },
            felk: { path: felk, exists: fs.existsSync(felk) },
          },
          pid: ownedProcess()?.pid ?? null,
          profile,
          bridge: live,
          reason,
          limitations: [
            'No exact stepping; frame_advance waits at least N frames within a 15 s bound (wait in chunks of ~120 frames during loading)',
            'Pause/resume, state, Portal and Wiimote-connection tools require owned process and interactive Windows desktop (French/English UI)',
            'Bridge dispatch stops during native pause',
            'Game-mod descriptor paths must use forward slashes; a booting descriptor does not prove a file was replaced',
          ],
          M0: gateStatus(),
        });
        break;
      }
      case 'dolphin_launch':
        result = ok(await launch(a));
        break;
      case 'dolphin_stop':
        result = ok(await stop());
        break;
      case 'dolphin_logs':
        result = ok(tailLog(a.lines ?? 100));
        break;
      case 'dolphin_build_patch_launch': {
        if (!fs.statSync(a.patch_root).isDirectory()) throw new Error('Patch root must be a directory');
        const descriptor = buildDescriptor(a.game, a.xml, a.patch_root, a.options);
        initializeProfile();
        const output = path.join(evidence, 'patch-' + randomUUID() + '.json');
        fs.writeFileSync(output, JSON.stringify(descriptor, null, 2), { flag: 'wx' });
        result = ok({ output, descriptor, engine_validation: 'PENDING' });
        break;
      }
      case 'dolphin_hold_wii_input':
        result = ok(await bridgeCall('controller.hold', [a.port ?? 0, a.buttons ?? {}, a.nunchuk ?? {}, a.frames]));
        break;
      case 'dolphin_get_wii_input':
        result = ok({
          buttons: await bridgeCall('controller.get_wiimote_buttons', [a.port ?? 0]),
          nunchuk: await bridgeCall('controller.get_wii_nunchuk_buttons', [a.port ?? 0]),
        });
        break;
      case 'dolphin_read_float':
        result = ok(await bridgeCall('memory.read_f' + (a.bits ?? 32), [a.address]));
        break;
      case 'dolphin_write_float':
        result = ok(await bridgeCall('memory.write_f' + (a.bits ?? 32), [a.address, a.value]));
        break;
      case 'dolphin_write64': {
        const v = BigInt(a.value);
        if (v < 0n || v > 0xffffffffffffffffn) throw new Error('unsigned 64-bit value required');
        result = ok(await bridgeCall('memory.write_u64', [a.address, v.toString()]));
        break;
      }
      case 'dolphin_save_state':
      case 'dolphin_load_state': {
        const id = Buffer.from(await bridgeCall('memory.read_bytes', [0x80000000, 6]), 'hex').toString('ascii');
        if (!/^[A-Z0-9]{6}$/.test(id)) throw new Error('A disc game ID is required for state-file verification');
        const filename = path.join(profile, 'StateSaves', id + '.s' + String(a.slot).padStart(2, '0'));
        const saving = name === 'dolphin_save_state';
        if (!saving) existingFile(filename);
        // Native GUI dispatch avoids the frame-callback save failure observed in gameplay.
        const previous = fs.existsSync(filename) ? fs.statSync(filename).mtimeMs : 0;
        const backup = saving && previous ? path.join(evidence, 'state-backup-' + randomUUID() + '.sav') : null;
        if (backup) fs.copyFileSync(filename, backup, fs.constants.COPYFILE_EXCL);
        await uiControl(saving ? 'save_state' : 'load_state', { slot: a.slot });
        if (saving) {
          let complete = false;
          for (let i = 0; i < 100; i++) {
            await delay(100);
            if (fs.existsSync(filename)) {
              const stat = fs.statSync(filename);
              if (stat.size > 0 && stat.mtimeMs > previous) {
                complete = true;
                break;
              }
            }
          }
          if (!complete) throw new Error('Save was scheduled but completed state file was not observed: ' + filename);
        }
        result = ok({
          filename,
          backup,
          operation: saving ? 'saved_file_verified' : 'load_scheduled',
          bytes: fs.statSync(filename).size,
        });
        break;
      }
      default:
        result = await upstreamCall(req);
    }
    initializeProfile();
    const audit = {
      at: new Date().toISOString(),
      tool: name,
      args: a,
      result: result.content.filter(x => x.type === 'text'),
      isError: result.isError ?? false,
    };
    fs.appendFileSync(path.join(evidence, 'calls.jsonl'), JSON.stringify(audit) + '\n');
    if (name === 'dolphin_screenshot') {
      const png = result.content.find(x => x.type === 'image');
      if (png) {
        const output = path.join(evidence, randomUUID() + '.png');
        fs.writeFileSync(output, Buffer.from(png.data, 'base64'));
        result.content.push({ type: 'text', text: output });
      }
    }
    return result;
  } catch (e) {
    try {
      initializeProfile();
      fs.appendFileSync(
        path.join(evidence, 'calls.jsonl'),
        JSON.stringify({ at: new Date().toISOString(), tool: name, args: a, isError: true, error: e.message }) + '\n',
      );
    } catch {
      // The call log is evidence, not control flow: a failed append must not hide the tool error itself.
    }
    return { isError: true, content: [{ type: 'text', text: e.message }] };
  }
}
await server.connect(new StdioServerTransport());
