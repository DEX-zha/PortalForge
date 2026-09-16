#!/usr/bin/env node
// Checks the gate files the tooling reads: a known status, evidence behind every PASS, and documents that
// exist at the paths the status files point to.
import fs from 'node:fs';

const GATES = ['docs/m0-status.json', 'docs/m1-status.json', 'docs/m2-status.json', 'docs/m3-status.json'];
const ALLOWED = new Set(['PASS', 'FAIL', 'UNKNOWN', 'NOT_VALIDATED']);

const problems = [];
const rows = [];

for (const file of GATES) {
  if (!fs.existsSync(file)) { problems.push(`${file} is missing`); continue; }
  let gate;
  try { gate = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { problems.push(`${file}: invalid JSON (${e.message})`); continue; }

  const status = gate.status ?? 'UNKNOWN';
  if (!ALLOWED.has(status)) problems.push(`${file}: unknown status ${status}`);

  const evidence = Array.isArray(gate.evidence) ? gate.evidence : [];
  if (status === 'PASS') {
    if (!evidence.length) problems.push(`${file}: PASS without evidence`);
    if (!gate.validated_on) problems.push(`${file}: PASS without a validation date`);
  }

  for (const target of String(gate.details ?? '').split(',').map(s => s.trim()).filter(Boolean)) {
    if (target.startsWith('docs/') && !fs.existsSync(target)) {
      problems.push(`${file}: details points at ${target}, which does not exist`);
    }
  }

  rows.push(`| ${gate.gate ?? file} | ${status} | ${gate.validated_on ?? '-'} | ${evidence.length} |`);
}

const entry = 'docs/level-entry-status.json';
if (!fs.existsSync(entry)) {
  problems.push(`${entry} is missing`);
} else {
  const matrix = JSON.parse(fs.readFileSync(entry, 'utf8'));
  for (const level of matrix.levels ?? []) {
    if (level.status === 'CONFIRMED' && !level.proof) {
      problems.push(`${entry}: ${level.archive ?? level.level} is CONFIRMED without a proof reference`);
    }
  }
}

if (problems.length) {
  for (const p of problems) console.error(`::error::${p}`);
  process.exit(1);
}

console.log(`${GATES.length} gate files valid, evidence present for every PASS`);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    ['', '### Gates', '', '| Gate | Status | Validated | Evidence items |', '|---|---|---|---|', ...rows, ''].join('\n'));
}
