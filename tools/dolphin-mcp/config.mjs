// Machine-specific settings: where the game image, the figure dump and the user's own Dolphin tools live.
//
// Nothing here is committed. Values come from .local/dolphin-config.json (see config.example.json), and each
// one can be overridden by an environment variable, which is what a CI job or a second checkout would use.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const configFile = path.resolve(here, '../../.local/dolphin-config.json');

const SETTINGS = {
  game: { env: 'PORTALFORGE_GAME', what: 'the game image (WBFS)' },
  figure: { env: 'PORTALFORGE_FIGURE', what: 'the Skylander figure dump (.sky)' },
  official_dolphin: { env: 'PORTALFORGE_OFFICIAL_DOLPHIN', what: "the user's own Dolphin.exe" },
  dolphin_tool: { env: 'PORTALFORGE_DOLPHINTOOL', what: 'DolphinTool.exe' },
  // { "<disc path>": "<fixup map file>" }: the runtime pointer maps captured per level (as JSON in the variable).
  runtime_maps: { env: 'PORTALFORGE_RUNTIME_MAPS', what: 'the runtime fixup maps per level' },
};

function readConfigFile() {
  try {
    return JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch {
    return {}; // no configuration yet: every setting reads as unset
  }
}

// The configured value, or null when it is not set.
export function setting(key) {
  const definition = SETTINGS[key];
  if (!definition) throw new Error(`Unknown setting ${key}`);
  return process.env[definition.env] || readConfigFile()[key] || null;
}

// The configured value, or an error that says how to provide it.
export function requireSetting(key) {
  const value = setting(key);
  if (value) return value;
  const { env, what } = SETTINGS[key];
  throw Object.assign(
    new Error(`${what} is not configured: set "${key}" in ${configFile}, or the ${env} environment variable`),
    { exitCode: 3 },
  );
}
