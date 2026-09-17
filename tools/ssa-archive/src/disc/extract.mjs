// Disc listing and single-file extraction through DolphinTool, DATA partition only. FR-002, FR-017.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { runDolphinTool } from './identify.mjs';

export async function listDisc(game, filter = null) {
  const out = await runDolphinTool(['extract', '-i', path.resolve(game), '-g', '-l']);
  const files = out
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('///') && !l.endsWith('/'));
  const re = filter ? new RegExp(filter) : null;
  return re ? files.filter(f => re.test(f)) : files;
}

export async function extractFile(game, discPath, outDir) {
  const out = path.resolve(outDir);
  fs.mkdirSync(out, { recursive: true });
  await runDolphinTool(['extract', '-i', path.resolve(game), '-o', out, '-g', '-s', discPath]);
  const file = path.join(out, 'DATA', 'files', ...discPath.split('/'));
  if (!fs.existsSync(file)) throw Object.assign(new Error('DolphinTool did not produce ' + file), { exitCode: 3 });
  const data = fs.readFileSync(file);
  return { disc_path: discPath, file, size: data.length, sha256: createHash('sha256').update(data).digest('hex') };
}

export const samplePath = (samplesRoot, discPath) => path.join(samplesRoot, 'DATA', 'files', ...discPath.split('/'));
