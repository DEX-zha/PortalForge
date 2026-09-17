// The command-line layer, exercised without any game data: parsing, dispatch, exit codes and the registry.
// The commands' own behaviour is covered by the tests of the modules they call.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { commandNames, hasCommand, loadCommand } from '../src/cli/commands/index.mjs';
import { EXIT, CliError, need } from '../src/cli/errors.mjs';
import { OPTIONS } from '../src/cli/options.mjs';
import { USAGE } from '../src/cli/usage.mjs';
import { parseHexList, parseReplace, parseSetEdits, firstFixup } from '../src/cli/args.mjs';
import { pickSubcommand } from '../src/cli/dispatch.mjs';

const cliDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (...args) => spawnSync(process.execPath, ['cli.mjs', ...args], { cwd: cliDir, encoding: 'utf8' });

test('cli: no command prints the usage and is a usage error', () => {
  const r = run();
  assert.equal(r.status, EXIT.USAGE);
  assert.match(r.stdout, /^ssa-archive <command> \[options\]/);
});

test('cli: --help prints the usage and succeeds', () => {
  const r = run('--help');
  assert.equal(r.status, EXIT.OK);
  assert.equal(r.stdout.trim(), USAGE.trim());
});

test('cli: an unknown command and an unknown option are usage errors on stderr', () => {
  const command = run('nope');
  assert.equal(command.status, EXIT.USAGE);
  assert.match(command.stderr, /^Unknown command: nope/);
  const option = run('gates', '--does-not-exist');
  assert.equal(option.status, EXIT.USAGE);
  assert.match(option.stderr, /does-not-exist/);
});

test('cli: gates reads the status files of the repository, whatever the working directory', () => {
  const r = spawnSync(process.execPath, [path.join(cliDir, 'cli.mjs'), 'gates', '--json'], {
    cwd: path.resolve(cliDir, '../..'),
    encoding: 'utf8',
  });
  assert.equal(r.status, EXIT.OK);
  const gates = JSON.parse(r.stdout);
  assert.deepEqual(
    gates.map(g => g.name),
    ['M0', 'M1', 'M2', 'M3', 'M4A', 'M4B', 'M5'],
  );
  for (const gate of gates) assert.match(gate.status, /^(PASS|FAIL|UNKNOWN|NOT_VALIDATED)$/);
});

test('cli: findings validate accepts every committed record', () => {
  const r = run('findings', 'validate');
  assert.equal(r.status, EXIT.OK, r.stdout + r.stderr);
  assert.match(r.stdout, /^\d+ finding\(s\) valid/);
});

test('cli: an unknown subcommand names its group and is a usage error', () => {
  for (const [args, message] of [
    [['findings', 'bogus'], /Unknown findings subcommand bogus/],
    [['experiment', 'bogus'], /Unknown experiment kind bogus/],
    [['shot', 'bogus'], /Unknown shot subcommand bogus/],
  ]) {
    const r = run(...args);
    assert.equal(r.status, EXIT.USAGE, args.join(' '));
    assert.match(r.stderr, message);
  }
});

test('cli: a missing required argument is reported by name', () => {
  const r = run('patch', '--experiment', 'x');
  assert.equal(r.status, EXIT.USAGE);
  assert.match(r.stderr, /Missing --game/);
});

test('registry: every command loads to a function', async () => {
  for (const name of commandNames()) {
    assert.ok(hasCommand(name));
    assert.equal(typeof (await loadCommand(name)), 'function', name);
  }
  assert.equal(hasCommand('constructor'), false, 'inherited properties are not commands');
});

test('usage: every registered command is documented, and nothing else is', () => {
  const documented = new Set(
    USAGE.split('\n')
      .map(line => /^ {2}([a-z][a-z0-9-]*)\b/.exec(line)?.[1])
      .filter(Boolean),
  );
  for (const name of commandNames()) assert.ok(documented.has(name), `${name} is missing from the usage text`);
  for (const name of documented) assert.ok(hasCommand(name), `${name} is documented but not registered`);
});

test('usage: every option it mentions is declared', () => {
  const mentioned = new Set([...USAGE.matchAll(/--([a-z][a-z0-9-]*)/g)].map(m => m[1]));
  for (const option of mentioned)
    assert.ok(Object.hasOwn(OPTIONS, option), `--${option} is documented but not declared`);
});

test('args: need, parseReplace, parseSetEdits, parseHexList and firstFixup', () => {
  assert.equal(need('x', 'name'), 'x');
  assert.throws(
    () => need('', 'game'),
    e => e instanceof CliError && e.exitCode === EXIT.USAGE && /--game/.test(e.message),
  );
  assert.deepEqual(parseReplace(['3=a.bin', 'level/x.bld=b=c.bin'], 'index'), { 3: 'a.bin', 'level/x.bld': 'b=c.bin' });
  assert.throws(() => parseReplace(['=nokey'], 'index'), CliError);
  assert.deepEqual(parseSetEdits(['0x6c=85.5', '+0x24:u32be=7', '1ac:u8=1']), [
    { offset: 0x6c, type: 'f32be', value: 85.5 },
    { offset: 0x24, type: 'u32be', value: 7 },
    { offset: 0x1ac, type: 'u8', value: 1 },
  ]);
  assert.throws(() => parseSetEdits(['nonsense']), CliError);
  assert.deepEqual(parseHexList('50,128,1ac'), [0x50, 0x128, 0x1ac]);
  assert.deepEqual(parseHexList(undefined), []);
  assert.equal(firstFixup(['a.json', 'b.json']), 'a.json');
  assert.equal(firstFixup('a.json'), 'a.json');
});

test('dispatch: pickSubcommand ignores inherited properties and uses the group wording', () => {
  const table = { list: () => 'listed' };
  assert.equal(pickSubcommand(table, 'list', () => 'unused')(), 'listed');
  assert.throws(
    () => pickSubcommand(table, 'toString', name => `Unknown thing ${name}`),
    e => e instanceof CliError && e.message === 'Unknown thing toString',
  );
});
