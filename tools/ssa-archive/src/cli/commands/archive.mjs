// Disc and IGA archive commands: identify, disc-list, disc-extract, info, list, extract, verify, rebuild,
// diff, patch.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { identify as identifyDisc } from '../../disc/identify.mjs';
import { listDisc, extractFile } from '../../disc/extract.mjs';
import { parseArchive, summarize } from '../../iga/reader.mjs';
import { verifyPath, verifyBuffer } from '../../iga/verify.mjs';
import { rebuildFromWorkspace } from '../../iga/writer.mjs';
import { diffArchives } from '../../iga/diff.mjs';
import { extractToWorkspace, readManifest } from '../../workspace/manifest.mjs';
import { buildPatchWorkspace } from '../../patch/riivolution.mjs';
import { CliError, EXIT, need } from '../errors.mjs';
import { parseReplace } from '../args.mjs';
import { sampleOf } from '../paths.mjs';

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const hex32 = value => '0x' + (value >>> 0).toString(16).padStart(8, '0');

function readArchive(file) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) throw new CliError('File not found: ' + resolved, EXIT.USAGE);
  return { path: resolved, buf: fs.readFileSync(resolved) };
}

// The disc path an extracted file came from, when it sits under a `DATA/files` tree.
function guessDiscPath(file) {
  const match = /DATA\/files\/(.+)$/.exec(file.replace(/\\/g, '/'));
  return match ? match[1] : path.basename(file);
}

export async function identify(pos, o) {
  const info = await identifyDisc(need(o.game, 'game'));
  let fileCount = null;
  try {
    fileCount = (await listDisc(info.path)).length;
  } catch {
    // The identity is still worth reporting when the file table cannot be listed.
  }
  return {
    result: { ...info, file_count: fileCount },
    exitCode: info.supported ? EXIT.OK : EXIT.UNSUPPORTED,
    text: `${info.game_id} ${info.region} rev ${info.revision} "${info.internal_name}" supported=${info.supported} files=${fileCount}`,
  };
}

export async function discList(pos, o) {
  const files = await listDisc(need(o.game, 'game'), o.filter ?? null);
  return { result: { count: files.length, files }, text: files.join('\n') };
}

export async function discExtract(pos, o) {
  const r = await extractFile(need(o.game, 'game'), need(o.path, 'path'), need(o.out, 'out'));
  return { result: r, text: `${r.disc_path} -> ${r.file} (${r.size} bytes, sha256 ${r.sha256})` };
}

export async function info(pos) {
  const { path: file, buf } = readArchive(need(pos[0], 'archive'));
  const parsed = parseArchive(buf);
  const s = summarize(parsed);
  const unsupported = parsed.issues.some(i => i.reason === 'UNSUPPORTED_VERSION' || i.reason === 'BAD_MAGIC');
  return {
    result: { file, sha256: sha256(buf), ...s, header_words_hex: s.header_words.map(w => '0x' + w.toString(16)) },
    exitCode: unsupported ? EXIT.UNSUPPORTED : EXIT.OK,
    text: `${path.basename(file)}: version ${s.version}, ${s.count} entries, ${JSON.stringify(s.compression)}, name table @${s.name_table?.offset} (${s.name_table?.size}), sorted=${s.hashes_sorted}, issues=${s.issues}`,
  };
}

export async function list(pos) {
  const { buf } = readArchive(need(pos[0], 'archive'));
  const rows = parseArchive(buf).entries.map(e => ({
    index: e.index,
    name: e.name,
    hash: hex32(e.hash),
    start: e.start,
    size: e.size,
    stored_size: e.stored_size,
    mode: hex32(e.mode),
    compression: e.compression,
    chunk_table_index: e.chunk_table_index,
  }));
  const line = r =>
    `${String(r.index).padStart(4)} ${r.hash} ${String(r.start).padStart(10)} ${String(r.size).padStart(9)} ${r.mode} ${r.compression ?? 'UNSUPPORTED'} ${r.name}`;
  return { result: { count: rows.length, entries: rows }, text: rows.map(line).join('\n') };
}

export async function extract(pos, o) {
  const { path: file, buf } = readArchive(need(pos[0], 'archive'));
  const outDir = path.resolve(need(o.out, 'out'));
  const discPath = o['disc-path'] ?? guessDiscPath(file);
  let manifest;
  try {
    manifest = extractToWorkspace(buf, { discPath, sourceFile: file, outDir });
  } catch (e) {
    if (!e.failures) throw e;
    return {
      result: { status: 'INVALID', failures: e.failures },
      exitCode: EXIT.FAILED,
      text: 'Archive INVALID; ' + e.failures.length + ' failure(s). Run verify.',
    };
  }
  let decoded = null;
  if (o.decode) {
    const { decodeWorkspace } = await import('../../iga/decode.mjs');
    decoded = await decodeWorkspace(outDir);
  }
  const decodedText = decoded
    ? ` (decoded: ${decoded.decoded}/${decoded.total}${decoded.reason ? ', ' + decoded.reason : ''})`
    : '';
  return {
    result: { workspace: outDir, entries: manifest.entries.length, decoded },
    text: `Extracted ${manifest.entries.length} entries to ${outDir}` + decodedText,
  };
}

export async function verify(pos) {
  const { parsed: _parsed, ...report } = verifyPath(need(pos[0], 'archive|workspace'));
  const exitCode =
    report.status === 'VALID' ? EXIT.OK : report.status === 'UNSUPPORTED' ? EXIT.UNSUPPORTED : EXIT.FAILED;
  const failures = report.failures
    .map(f => `  ${f.reason} @${f.offset} ${f.field}: actual ${f.actual}, expected ${f.expected}`)
    .join('\n');
  return { result: report, exitCode, text: `${report.status}` + (failures ? '\n' + failures : '') };
}

export async function rebuild(pos, o) {
  const dir = path.resolve(need(pos[0], 'workspace dir'));
  const out = path.resolve(need(o.out, 'out'));
  const replacements = parseReplace(o.replace, 'index');
  for (const key of Object.keys(replacements)) {
    if (!/^\d+$/.test(key)) throw new CliError(`--replace index must be numeric: ${key}`);
  }

  // Re-encoding is only loaded when an entry actually has to be recompressed.
  let reencode = null;
  let transformAll = null;
  if (Object.keys(replacements).length || o['reencode-all']) {
    const decode = await import('../../iga/decode.mjs');
    reencode = decode.reencodeEntry;
    if (o['reencode-all']) transformAll = decode.reencodeStoredEntry;
  }

  const r = rebuildFromWorkspace(dir, {
    replacements: Object.fromEntries(Object.entries(replacements).map(([k, v]) => [Number(k), v])),
    reencode,
    transformAll,
    layout: o.layout ?? 'preserve',
    padUnits: o.pad ? Number(o.pad) : 0,
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, r.buffer);

  const manifest = readManifest(dir);
  const { parsed: _parsed, ...validation } = verifyBuffer(r.buffer);
  const diff = fs.existsSync(manifest.source.file)
    ? diffArchives(fs.readFileSync(manifest.source.file), r.buffer)
    : null;
  const failed = validation.status !== 'VALID' || (diff && diff.unclassified_bytes > 0);
  return {
    result: {
      path: out,
      sha256: sha256(r.buffer),
      size: r.buffer.length,
      strategy: r.strategy,
      relayout: r.relayout,
      replaced_entries: r.replaced_entries,
      validation,
      diff: diff
        ? { ...diff, regions: diff.regions.slice(0, 200) }
        : { note: 'source archive not found; diff skipped', source: manifest.source.file },
    },
    exitCode: failed ? EXIT.FAILED : EXIT.OK,
    text:
      `${out}: ${r.strategy}${r.relayout ? ' (relayout)' : ''}, ${validation.status}` +
      (diff
        ? `, diff regions=${diff.regions.length} size_delta=${diff.size_delta} unclassified=${diff.unclassified_bytes} ${JSON.stringify(diff.summary)}`
        : ''),
  };
}

export async function diff(pos) {
  const original = path.resolve(need(pos[0], 'original'));
  const rebuilt = path.resolve(need(pos[1], 'rebuilt'));
  const d = diffArchives(fs.readFileSync(original), fs.readFileSync(rebuilt));
  const region = r =>
    `${r.class.padEnd(8)} @${r.offset} len=${r.length} ${r.label ?? ''}\n  old ${r.old_hex}${r.truncated ? '…' : ''}\n  new ${r.new_hex}${r.truncated ? '…' : ''}`;
  return {
    result: d,
    exitCode: d.unclassified_bytes > 0 ? EXIT.FAILED : EXIT.OK,
    text: d.regions.length
      ? d.regions.slice(0, 50).map(region).join('\n') +
        `\nsize_delta=${d.size_delta} unclassified=${d.unclassified_bytes} ${JSON.stringify(d.summary)}`
      : `identical (${d.size_delta} size delta)`,
  };
}

export async function patch(pos, o) {
  const id = need(o.experiment, 'experiment');
  const game = need(o.game, 'game');
  const requested = parseReplace(o.replace, 'disc path');
  if (!Object.keys(requested).length) throw new CliError('At least one --replace <disc path>=<file> is required');
  // An original copy under .local/samples, when present, lets identical files be skipped (FR-009).
  const replacements = Object.entries(requested).map(([disc_path, file]) => {
    const original = sampleOf(disc_path);
    return { disc_path, file: path.resolve(file), original: fs.existsSync(original) ? original : undefined };
  });
  const ws = buildPatchWorkspace({
    experimentId: id,
    game,
    replacements,
    outDir: need(o.out, 'out'),
    force: !!o.force,
  });
  return {
    result: ws,
    text: `${ws.dir}: ${ws.replacements.length} replacement(s), xml ${ws.xml}, descriptor ${ws.descriptor}`,
  };
}
