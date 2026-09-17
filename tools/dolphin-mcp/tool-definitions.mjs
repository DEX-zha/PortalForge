// Tool catalogue of the PortalForge Dolphin MCP: the tools this server adds to the upstream `mcp-dolphin` set,
// and the corrections it makes to upstream descriptions and schemas.
//
// Descriptions are part of the contract. A model reads them to decide how to act, so each one states what the
// tool does NOT prove as plainly as what it does.

const int = (min, max) => ({ type: 'integer', minimum: min, maximum: max });
const str = { type: 'string', minLength: 1 };
const bool = { type: 'boolean' };
const unit = { type: 'number', minimum: -1, maximum: 1 };
const address = int(0, 0xffffffff);
const floatBits = { type: 'integer', enum: [32, 64] };

const schema = (properties = {}, required = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const WIIMOTE_BUTTONS = ['A', 'B', 'One', 'Two', 'Plus', 'Minus', 'Home', 'Up', 'Down', 'Left', 'Right'];
const GC_BUTTONS = ['A', 'B', 'X', 'Y', 'Z', 'Start', 'L', 'R', 'Up', 'Down', 'Left', 'Right'];
const GC_STICKS = ['StickX', 'StickY', 'CStickX', 'CStickY'];
const GC_TRIGGERS = ['TriggerLeft', 'TriggerRight'];

const wiimoteButtons = schema(Object.fromEntries(WIIMOTE_BUTTONS.map(name => [name, bool])));
const nunchuk = schema({ C: bool, Z: bool, StickX: unit, StickY: unit });

export const MAX_STATE_SLOT = 10; // Dolphin's native interface exposes ten save-state slots

export const EXTRA_TOOLS = [
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
    inputSchema: schema({ port: int(0, 3), buttons: wiimoteButtons, nunchuk, frames: int(1, 600) }, ['frames']),
  },
  {
    name: 'dolphin_get_wii_input',
    description: 'Read current emulated Wii Remote and Nunchuk state for a port.',
    inputSchema: schema({ port: int(0, 3) }),
  },
  {
    name: 'dolphin_read_float',
    description: 'Read a big-endian IEEE-754 float from MEM1/MEM2. Unaligned reads use exact bytes.',
    inputSchema: schema({ address, bits: floatBits }, ['address']),
  },
  {
    name: 'dolphin_write_float',
    description:
      'Write a big-endian IEEE-754 float to MEM1/MEM2, returning previous and new bytes. Changes live game state.',
    inputSchema: schema({ address, bits: floatBits, value: { type: 'number' } }, ['address', 'value']),
  },
];

// Upstream descriptions promise more than this runtime delivers: frame_advance is not exact stepping, save
// states go through the native interface and its ten slots, and the GameCube schema lacks its bounds.
export function correctUpstreamTools(tools) {
  for (const tool of tools) {
    if (tool.name.includes('state') && tool.inputSchema.properties?.slot) {
      tool.inputSchema.properties.slot.minimum = 1;
      tool.inputSchema.properties.slot.maximum = MAX_STATE_SLOT;
      tool.description =
        'Use native Dolphin UI to ' +
        (tool.name.includes('save') ? 'save' : 'load') +
        ' a state in the isolated profile, slot 1..10. Requires owned Dolphin, running game and interactive Windows desktop. Saves verify a newly written file; loads require subsequent observation. Same build and same patched game required.';
    }
    if (tool.name === 'dolphin_frame_advance') {
      tool.description =
        'Wait for AT LEAST N further frames while emulation runs. This is not exact stepping and does not pause the emulator. Times out if stopped or paused.';
    }
    if (tool.name === 'dolphin_screenshot') {
      tool.description =
        'Return the latest rendered frame as PNG. Requires the bridge to be responsive and game running; GUI pause prevents requests.';
    }
    if (tool.name === 'dolphin_set_wiimote_acceleration') {
      tool.description = 'Override Wii Remote acceleration for the current frame, in metres/second squared (m/s²).';
      for (const axis of ['x', 'y', 'z']) tool.inputSchema.properties[axis].description = 'Acceleration in m/s²';
    }
    if (tool.name === 'dolphin_press_gc_buttons') {
      tool.description =
        'Override supplied GC controls for the current frame. Sticks -1..1, triggers 0..1; omitted inputs are not overridden.';
      tool.inputSchema.properties.state = schema({
        ...Object.fromEntries(GC_BUTTONS.map(name => [name, bool])),
        ...Object.fromEntries(GC_STICKS.map(name => [name, unit])),
        ...Object.fromEntries(GC_TRIGGERS.map(name => [name, { type: 'number', minimum: 0, maximum: 1 }])),
      });
    }
  }
  return tools;
}
