#!/usr/bin/env node
// ssa-archive CLI. Contract: specs/001-ssa-level-research/contracts/ssa-archive-cli.md
//
// This file only parses the command line, dispatches, and prints. Commands live in src/cli/commands/ and
// return { result, text?, exitCode? }: `result` is printed with --json, `text` otherwise.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { hasCommand, loadCommand } from './src/cli/commands/index.mjs';
import { EXIT } from './src/cli/errors.mjs';
import { OPTIONS } from './src/cli/options.mjs';
import { USAGE } from './src/cli/usage.mjs';

export async function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (e) {
    process.stderr.write(e.message + '\n' + USAGE + '\n');
    return EXIT.USAGE;
  }

  const { values: o, positionals } = parsed;
  const [name, ...pos] = positionals;
  if (o.help) {
    process.stdout.write(USAGE + '\n');
    return EXIT.OK;
  }
  if (!name) {
    process.stdout.write(USAGE + '\n');
    return EXIT.USAGE;
  }
  if (!hasCommand(name)) {
    process.stderr.write(`Unknown command: ${name}\n${USAGE}\n`);
    return EXIT.USAGE;
  }

  try {
    const command = await loadCommand(name);
    const { result, exitCode = EXIT.OK, text } = await command(pos, o);
    const output = o.json || text === undefined || text === null ? JSON.stringify(result, null, 2) : text;
    process.stdout.write(output + '\n');
    return exitCode;
  } catch (e) {
    process.stderr.write((e.message ?? String(e)) + '\n');
    if (process.env.SSA_DEBUG) process.stderr.write((e.stack ?? '') + '\n');
    return e.exitCode ?? EXIT.USAGE;
  }
}

// Run only when started as a script, so tests can import `main` without side effects.
const normalise = file => (process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file));
const startedDirectly = process.argv[1] && normalise(process.argv[1]) === normalise(fileURLToPath(import.meta.url));
if (startedDirectly) process.exitCode = await main();
