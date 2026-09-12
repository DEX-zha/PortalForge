#!/usr/bin/env node
// ssa-archive CLI. Contract: specs/001-ssa-level-research/contracts/ssa-archive-cli.md
// Exit codes: 0 success, 1 validation/experiment failure, 2 unsupported input, 3 usage or I/O error.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { identify } from './src/disc/identify.mjs';
import { listDisc, extractFile } from './src/disc/extract.mjs';
import { parseArchive, summarize } from './src/iga/reader.mjs';
import { verifyPath } from './src/iga/verify.mjs';
import { extractToWorkspace } from './src/workspace/manifest.mjs';
import { commands as extraCommands } from './src/cli-commands.mjs';

const USAGE = `ssa-archive <command> [options]

  identify --game <wbfs>
  disc-list --game <wbfs> [--filter <regex>]
  disc-extract --game <wbfs> --path <disc path> --out <dir>
  info <archive>
  list <archive>
  extract <archive> --out <workspace dir> [--disc-path <path>] [--decode]
  verify <archive|workspace>
  rebuild <workspace dir> --out <archive> [--replace <index>=<file>]...
  diff <original> <rebuilt>
  patch --experiment <id> --game <wbfs> --replace <disc path>=<file>... --out <patch dir>
  scan floats <file> [--range min max] [--vector 2|3|4|16] [--endian le|be|both]
  scan strings <file> [--min 6]
  bindiff <a> <b> [--context 16]
  experiment m1 --archive <disc path> [--figure <.sky>] [--input-script <json>]
  experiment m2 --archive <disc path> --entry <i> --offset <n> --type <t> --value <v> --predict "<text>" [--repeat 2]
  findings list|show <id>|validate
  gates

All commands accept --json.`;

const options = {
  json: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h', default: false },
  game: { type: 'string' }, filter: { type: 'string' }, path: { type: 'string' }, out: { type: 'string' },
  'disc-path': { type: 'string' }, decode: { type: 'boolean', default: false }, replace: { type: 'string', multiple: true },
  experiment: { type: 'string' }, range: { type: 'string' }, vector: { type: 'string' }, endian: { type: 'string' },
  min: { type: 'string' }, context: { type: 'string' }, archive: { type: 'string' }, figure: { type: 'string' }, 'input-script': { type: 'string' },
  entry: { type: 'string' }, offset: { type: 'string' }, type: { type: 'string' }, value: { type: 'string' }, predict: { type: 'string' },
  repeat: { type: 'string' }, id: { type: 'string' }, 'dry-run': { type: 'boolean', default: false },
  layout: { type: 'string' }, pad: { type: 'string' }, 'reencode-all': { type: 'boolean', default: false }, force: { type: 'boolean', default: false },
  script: { type: 'string' }, label: { type: 'string' }, variant: { type: 'string' }, 'skip-control': { type: 'boolean', default: false },
  category: { type: 'string' }, to: { type: 'string' }, probe: { type: 'string' }, summary: { type: 'string' }, limit: { type: 'string' },
  watch: { type: 'string', multiple: true }, finding: { type: 'string' }, run: { type: 'string' }, observed: { type: 'string' }, match: { type: 'string' },
  pattern: { type: 'string', multiple: true }, poke: { type: 'string', multiple: true }, 'save-slot': { type: 'string' },
  histogram: { type: 'boolean', default: false }, tol: { type: 'string' }, 'no-dimensions': { type: 'boolean', default: false }, dimensions: { type: 'boolean', default: false }, base: { type: 'string' }, address: { type: 'string' },
};

export class CliError extends Error { constructor(message, exitCode = 3) { super(message); this.exitCode = exitCode; } }
const need = (v, name) => { if (v === undefined || v === null || v === '') throw new CliError(`Missing --${name}`, 3); return v; };
const readArchive = file => { const p = path.resolve(file); if (!fs.existsSync(p)) throw new CliError('File not found: ' + p, 3); return { path: p, buf: fs.readFileSync(p) }; };

const commands = {
  async identify(pos, o) {
    const info = await identify(need(o.game, 'game'));
    let file_count = null; try { file_count = (await listDisc(info.path)).length; } catch { }
    return { result: { ...info, file_count }, exitCode: info.supported ? 0 : 2,
      text: `${info.game_id} ${info.region} rev ${info.revision} "${info.internal_name}" supported=${info.supported} files=${file_count}` };
  },
  async 'disc-list'(pos, o) {
    const files = await listDisc(need(o.game, 'game'), o.filter ?? null);
    return { result: { count: files.length, files }, text: files.join('\n') };
  },
  async 'disc-extract'(pos, o) {
    const r = await extractFile(need(o.game, 'game'), need(o.path, 'path'), need(o.out, 'out'));
    return { result: r, text: `${r.disc_path} -> ${r.file} (${r.size} bytes, sha256 ${r.sha256})` };
  },
  async info(pos) {
    const { path: file, buf } = readArchive(need(pos[0], 'archive'));
    const parsed = parseArchive(buf);
    const s = summarize(parsed);
    const { createHash } = await import('node:crypto');
    const result = { file, sha256: createHash('sha256').update(buf).digest('hex'), ...s, header_words_hex: s.header_words.map(w => '0x' + w.toString(16)) };
    const unsupported = parsed.issues.some(i => i.reason === 'UNSUPPORTED_VERSION' || i.reason === 'BAD_MAGIC');
    return { result, exitCode: unsupported ? 2 : 0, text: `${path.basename(file)}: version ${s.version}, ${s.count} entries, ${JSON.stringify(s.compression)}, name table @${s.name_table?.offset} (${s.name_table?.size}), sorted=${s.hashes_sorted}, issues=${s.issues}` };
  },
  async list(pos) {
    const { buf } = readArchive(need(pos[0], 'archive'));
    const parsed = parseArchive(buf);
    const rows = parsed.entries.map(e => ({ index: e.index, name: e.name, hash: '0x' + (e.hash >>> 0).toString(16).padStart(8, '0'), start: e.start, size: e.size,
      stored_size: e.stored_size, mode: '0x' + (e.mode >>> 0).toString(16).padStart(8, '0'), compression: e.compression, chunk_table_index: e.chunk_table_index }));
    return { result: { count: rows.length, entries: rows }, text: rows.map(r => `${String(r.index).padStart(4)} ${r.hash} ${String(r.start).padStart(10)} ${String(r.size).padStart(9)} ${r.mode} ${r.compression ?? 'UNSUPPORTED'} ${r.name}`).join('\n') };
  },
  async extract(pos, o) {
    const { path: file, buf } = readArchive(need(pos[0], 'archive'));
    const outDir = path.resolve(need(o.out, 'out'));
    const discPath = o['disc-path'] ?? guessDiscPath(file);
    let manifest;
    try { manifest = extractToWorkspace(buf, { discPath, sourceFile: file, outDir }); }
    catch (e) { if (e.failures) return { result: { status: 'INVALID', failures: e.failures }, exitCode: 1, text: 'Archive INVALID; ' + e.failures.length + ' failure(s). Run verify.' }; throw e; }
    let decoded = null;
    if (o.decode) { const { decodeWorkspace } = await import('./src/iga/decode.mjs'); decoded = await decodeWorkspace(outDir); }
    return { result: { workspace: outDir, entries: manifest.entries.length, decoded }, text: `Extracted ${manifest.entries.length} entries to ${outDir}` + (decoded ? ` (decoded: ${decoded.decoded}/${decoded.total}${decoded.reason ? ', ' + decoded.reason : ''})` : '') };
  },
  async verify(pos) {
    const r = verifyPath(need(pos[0], 'archive|workspace'));
    const { parsed, ...rest } = r;
    const exitCode = rest.status === 'VALID' ? 0 : rest.status === 'UNSUPPORTED' ? 2 : 1;
    return { result: rest, exitCode, text: `${rest.status}` + (rest.failures.length ? '\n' + rest.failures.map(f => `  ${f.reason} @${f.offset} ${f.field}: actual ${f.actual}, expected ${f.expected}`).join('\n') : '') };
  },
  ...extraCommands,
};

function guessDiscPath(file) {
  const norm = file.replace(/\\/g, '/');
  const m = /DATA\/files\/(.+)$/.exec(norm);
  return m ? m[1] : path.basename(file);
}

export async function main(argv = process.argv.slice(2)) {
  let parsed;
  try { parsed = parseArgs({ args: argv, options, allowPositionals: true, strict: true }); }
  catch (e) { process.stderr.write(e.message + '\n' + USAGE + '\n'); return 3; }
  const { values: o, positionals } = parsed;
  const [name, ...pos] = positionals;
  if (o.help || !name) { process.stdout.write(USAGE + '\n'); return name ? 0 : 3; }
  const cmd = commands[name];
  if (!cmd) { process.stderr.write(`Unknown command: ${name}\n${USAGE}\n`); return 3; }
  try {
    const { result, exitCode = 0, text } = await cmd(pos, o);
    process.stdout.write((o.json ? JSON.stringify(result, null, 2) : (text ?? JSON.stringify(result, null, 2))) + '\n');
    return exitCode;
  } catch (e) {
    process.stderr.write((e.message ?? String(e)) + '\n');
    if (process.env.SSA_DEBUG) process.stderr.write((e.stack ?? '') + '\n');
    return e.exitCode ?? 3;
  }
}

if (import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href || process.argv[1]?.endsWith('cli.mjs')) {
  process.exitCode = await main();
}
