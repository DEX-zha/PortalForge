#!/usr/bin/env node
// Fails when the repository tracks game data, an unpublished image, an oversized file, or when the
// .gitignore rules that keep game data out have been removed.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const FORBIDDEN = /\.(wbfs|iso|rvz|gcz|wud|wad|nkit|bld|arc|igz|pak|mdl|sky|sav|s\d\d|raw|bin|dump|dol|elf)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i;
const IMAGE_DIR = 'docs/images/';
const MAX_IMAGES = 12;
const MAX_BYTES = 2 * 1024 * 1024;
const REQUIRED_IGNORES = ['.local/', '*.wbfs', '*.bld', '*.arc', '*.igz', '*.sky'];

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter(f => !f.includes('node_modules/'));

const problems = [];
let images = 0;

for (const f of tracked) {
  if (FORBIDDEN.test(f)) {
    problems.push(`${f}: game data must not be committed; keep it under .local/`);
    continue;
  }
  if (IMAGE.test(f)) {
    images++;
    if (!f.startsWith(IMAGE_DIR)) problems.push(`${f}: images belong in ${IMAGE_DIR}`);
  }
  let size = 0;
  try {
    size = fs.statSync(f).size;
  } catch {
    continue;
  }
  if (size > MAX_BYTES) {
    problems.push(`${f}: ${(size / 1048576).toFixed(1)} MB, over the ${MAX_BYTES / 1048576} MB limit`);
  }
}

if (images > MAX_IMAGES) problems.push(`${images} images tracked, over the ${MAX_IMAGES} allowed`);

const ignore = fs.existsSync('.gitignore') ? fs.readFileSync('.gitignore', 'utf8').split(/\r?\n/) : [];
for (const rule of REQUIRED_IGNORES) {
  if (!ignore.some(l => l.trim() === rule)) problems.push(`.gitignore no longer excludes ${rule}`);
}

if (problems.length) {
  for (const p of problems) console.error(`::error::${p}`);
  process.exit(1);
}

const summary = `${tracked.length} tracked files, ${images} published images, no game data, nothing over ${MAX_BYTES / 1048576} MB`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- No game data: ${summary}\n`);
}
