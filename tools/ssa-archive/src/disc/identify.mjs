// Disc identification through the user's DolphinTool (read-only on the dump). FR-001.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const SUPPORTED_GAME_ID = 'SSPP52';
export const dolphinTool =
  process.env.PORTALFORGE_DOLPHINTOOL ?? 'C:/Users/romai/Desktop/dolphin-2606a-x64/Dolphin-x64/DolphinTool.exe';

export async function runDolphinTool(args, timeout = 600000) {
  if (!fs.existsSync(dolphinTool))
    throw Object.assign(new Error('DolphinTool.exe not found: ' + dolphinTool), { exitCode: 3 });
  const { stdout } = await promisify(execFile)(dolphinTool, args, {
    encoding: 'utf8',
    timeout,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

export async function identify(game) {
  const file = path.resolve(game);
  if (!fs.existsSync(file)) throw Object.assign(new Error('Game dump not found: ' + file), { exitCode: 3 });
  const out = await runDolphinTool(['header', '-i', file]);
  const field = label => (new RegExp('^' + label + ':\\s*(.*)$', 'm').exec(out)?.[1] ?? '').trim();
  const info = {
    path: file,
    game_id: field('Game ID'),
    region: field('Region'),
    country: field('Country'),
    revision: Number(field('Revision')) || 0,
    internal_name: field('Internal Name'),
    title_id: field('Title ID'),
  };
  info.supported = info.game_id === SUPPORTED_GAME_ID;
  return info;
}
