#!/usr/bin/env node
// Reads a `node --test` log and fails on test failures, on a missing summary, or when fewer tests ran than
// expected. Fixture tests skip themselves when the game data is absent, which is always the case on a runner;
// the floor catches a broken fixture path that would make whole files skip silently.
//
// usage: node check-test-output.mjs <log file> <label> <minimum passing tests>
import fs from 'node:fs';

const [file, label, min] = process.argv.slice(2);
if (!file || !label || !min) {
  console.error('usage: check-test-output.mjs <log file> <label> <minimum passing tests>');
  process.exit(2);
}

const log = fs.readFileSync(file, 'utf8');
const count = key => {
  const m = log.match(new RegExp(`^\\W*${key} (\\d+)\\s*$`, 'm'));
  return m ? Number(m[1]) : null;
};

const tests = count('tests'),
  pass = count('pass'),
  fail = count('fail'),
  skipped = count('skipped');
if (pass === null || fail === null) {
  console.error(`::error::${label}: no test summary in ${file}; the run did not reach the reporter`);
  process.exit(1);
}

const line = `${label}: ${pass} passed, ${fail} failed, ${skipped ?? 0} skipped, of ${tests ?? '?'}`;
console.log(line);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${line}\n`);

if (fail > 0) {
  console.error(`::error::${label}: ${fail} test(s) failed`);
  process.exit(1);
}
if (pass < Number(min)) {
  console.error(
    `::error::${label}: ${pass} tests ran, expected at least ${min}. Tests that need an extracted` +
      ' level skip themselves on a runner, but a drop this large means a fixture path broke.',
  );
  process.exit(1);
}
