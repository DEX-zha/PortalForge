#!/usr/bin/env node
// Checks the documentation set: every relative Markdown link resolves, every tracked JSON parses, and the
// documents the tooling reads by a fixed path are still where the code expects them.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0').filter(Boolean).filter(f => !f.includes('node_modules/'));
const trackedSet = new Set(tracked);

// Paths resolved in code: tools/ssa-archive/src/experiments/run-game.mjs (gateStatus), src/cli-commands.mjs
// (gates), tools/dolphin-mcp/server.mjs (M0 status), src/research/findings.mjs (findings directory).
const CODE_PATHS = [
  'docs/m0-status.json', 'docs/m1-status.json', 'docs/m2-status.json', 'docs/m3-status.json',
  'docs/findings', 'docs/findings/records',
];

const problems = [];
let links = 0, json = 0;

for (const f of tracked.filter(f => f.endsWith('.md'))) {
  const text = fs.readFileSync(f, 'utf8');
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    links++;
    const clean = decodeURI(target.split('#')[0]);
    const resolved = path.resolve(path.dirname(f), clean);
    const fromRoot = path.relative(process.cwd(), resolved).split(path.sep).join('/');
    // .local/ holds the evidence and never ships with the repository, so a link into it resolves on the
    // machine that produced it and nowhere else. Name those files in code spans instead.
    if (fromRoot.startsWith('.local/')) {
      problems.push(`${f}: links to ${target}, which is never published; write it as a code span`);
      continue;
    }
    if (!fs.existsSync(resolved)) { problems.push(`${f}: broken link to ${target}`); continue; }
    // Windows resolves paths case-insensitively and Linux does not, so compare against what git tracks,
    // which is case-exact everywhere. Without this a wrong case only breaks on the runner.
    const isDir = fs.statSync(resolved).isDirectory();
    const known = isDir
      ? tracked.some(t => t.startsWith(fromRoot.replace(/\/$/, '') + '/'))
      : trackedSet.has(fromRoot);
    if (!known) problems.push(`${f}: ${target} does not match a tracked path exactly (check its case)`);
  }
}

for (const f of tracked.filter(f => f.endsWith('.json'))) {
  json++;
  try { JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { problems.push(`${f}: invalid JSON (${e.message})`); }
}

for (const p of CODE_PATHS) {
  if (!fs.existsSync(p)) problems.push(`${p} is missing; the tooling resolves that exact path`);
}

if (problems.length) {
  for (const p of problems) console.error(`::error::${p}`);
  process.exit(1);
}

const summary = `${links} relative links resolve, ${json} JSON files parse, code-resolved doc paths present`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- Docs: ${summary}\n`);
