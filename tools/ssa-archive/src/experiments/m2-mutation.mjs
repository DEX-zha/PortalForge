// M2 controlled world mutation (FR-011, FR-012, SC-004).
// One documented value is changed in one entry (decoded when LZMA-chunked), the archive is rebuilt
// (re-encoding only that entry), patched in, and the game is run `repeat` times with the same
// inputs. The driver records prediction, memory watches and screenshots; the observed effect is a
// human judgement recorded afterwards with `experiment m2-judge`, which decides PASS/FAIL:
// PASS only when every run has no crash/load error and the observation matches the prediction.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  GameSession,
  gameFromConfig,
  readScript,
  defaultScript,
  experimentsDir,
  gateStatus,
  local,
} from './run-game.mjs';
import { extractFile, samplePath } from '../disc/extract.mjs';
import { extractToWorkspace, readManifest, schemaValidator } from '../workspace/manifest.mjs';
import { verifyBuffer } from '../iga/verify.mjs';
import { rebuildFromWorkspace } from '../iga/writer.mjs';
import { diffArchives } from '../iga/diff.mjs';
import { buildPatchWorkspace, monitorSize } from '../patch/riivolution.mjs';
import { decodeWorkspace, reencodeEntry } from '../iga/decode.mjs';

const sha256 = b => createHash('sha256').update(b).digest('hex');
const samplesRoot = path.join(local, 'samples');
const TYPES = {
  f32le: [4, (b, o, v) => b.writeFloatLE(v, o), (b, o) => b.readFloatLE(o)],
  f32be: [4, (b, o, v) => b.writeFloatBE(v, o), (b, o) => b.readFloatBE(o)],
  u32le: [4, (b, o, v) => b.writeUInt32LE(v >>> 0, o), (b, o) => b.readUInt32LE(o)],
  u32be: [4, (b, o, v) => b.writeUInt32BE(v >>> 0, o), (b, o) => b.readUInt32BE(o)],
  u16le: [2, (b, o, v) => b.writeUInt16LE(v, o), (b, o) => b.readUInt16LE(o)],
  u16be: [2, (b, o, v) => b.writeUInt16BE(v, o), (b, o) => b.readUInt16BE(o)],
  u8: [1, (b, o, v) => b.writeUInt8(v, o), (b, o) => b.readUInt8(o)],
};

export async function prepareMutation({ archive, entry, offset, type, value, game, id, log = console.log }) {
  if (!TYPES[type]) throw new Error(`type must be one of ${Object.keys(TYPES).join(', ')}`);
  const [width, write, read] = TYPES[type];
  let source = samplePath(samplesRoot, archive);
  if (!fs.existsSync(source)) source = (await extractFile(game, archive, samplesRoot)).file;
  const original = fs.readFileSync(source);
  const wsDir = path.join(local, 'workspaces', id);
  fs.rmSync(wsDir, { recursive: true, force: true });
  extractToWorkspace(original, { discPath: archive, sourceFile: source, outDir: wsDir });
  let m = readManifest(wsDir);
  const e = m.entries[entry];
  if (!e) throw new Error(`No entry ${entry}`);
  let data;
  if (e.compression === 'LZMA_CHUNKED') {
    await decodeWorkspace(wsDir);
    m = readManifest(wsDir);
    data = fs.readFileSync(path.join(wsDir, m.entries[entry].decoded_file));
  } else data = fs.readFileSync(path.join(wsDir, e.file)).subarray(0, e.size);
  if (offset + width > data.length) throw new Error(`offset ${offset} + ${width} exceeds entry size ${data.length}`);
  const oldValue = read(data, offset),
    old_hex = data.subarray(offset, offset + width).toString('hex');
  const mutated = Buffer.from(data);
  write(mutated, offset, value);
  const new_hex = mutated.subarray(offset, offset + width).toString('hex');
  const replFile = path.join(wsDir, `mutated-entry-${entry}.bin`);
  fs.writeFileSync(replFile, mutated);
  const built = rebuildFromWorkspace(wsDir, { replacements: { [entry]: replFile }, reencode: reencodeEntry });
  const { parsed, ...validation } = verifyBuffer(built.buffer);
  const diff = diffArchives(original, built.buffer);
  const rebuiltPath = path.join(wsDir, `rebuilt-m2${path.extname(archive)}`);
  fs.writeFileSync(rebuiltPath, built.buffer);
  log(
    `mutation: entry ${entry} (${e.name}) @${offset} ${type} ${oldValue} -> ${value} (${old_hex} -> ${new_hex}); ${built.strategy}; ${validation.status}; diff ${diff.regions.length} regions`,
  );
  return {
    source,
    original_sha256: sha256(original),
    original_size: original.length,
    workspace: wsDir,
    rebuilt: rebuiltPath,
    rebuilt_sha256: sha256(built.buffer),
    rebuilt_size: built.buffer.length,
    strategy: built.strategy,
    validation,
    diff: {
      size_delta: diff.size_delta,
      unclassified_bytes: diff.unclassified_bytes,
      summary: diff.summary,
      regions: diff.regions.length,
    },
    mutation: {
      entry_index: entry,
      entry_name: e.name,
      offset,
      type,
      old_hex,
      new_hex,
      old_value: oldValue,
      new_value: value,
    },
  };
}

async function observe(session, label, target, { script, figure, archive, watch }) {
  const run = {
    label,
    target,
    monitor_lines: [],
    screenshots: [],
    log_excerpt: [],
    memory_reads: [],
    crash_or_load_error: false,
    observed_effect: '',
  };
  await session.launch(target, label);
  run.pid = session.pid;
  run.started = session.startedAt;
  try {
    run.trace = await session.runScriptSafe(readScript(script), {
      labelPrefix: label,
      onShot: f => run.screenshots.push(f),
      figure,
    });
  } catch (e) {
    run.crash_or_load_error = true;
    run.error = e.message;
    run.trace = e.trace ?? [];
  }
  for (const w of watch) {
    try {
      const t = session.text(await session.call('dolphin_read_range', { address: w, length: 16 }))[0];
      run.memory_reads.push({ address: w, bytes_hex: t });
    } catch (e) {
      run.memory_reads.push({ address: w, bytes_hex: 'ERROR ' + e.message });
    }
  }
  run.monitor_lines = session.monitorLines(archive);
  try {
    await session.call('dolphin_ping');
  } catch {
    run.crash_or_load_error = true;
  }
  run.log_excerpt = session
    .logSince()
    .split(/\r?\n/)
    .filter(l => /FileMon|PanicAlert|Fatal|Unable|Invalid/i.test(l))
    .slice(-40);
  run.finished = new Date().toISOString();
  run.stop = await session.stop();
  return run;
}

export async function runM2({
  archive,
  entry,
  offset,
  type,
  value,
  predict,
  findingId = null,
  repeat = 2,
  figure = null,
  script = defaultScript,
  watch = [],
  game = gameFromConfig(),
  skipControl = false,
  log = console.log,
}) {
  if (gateStatus('m0').status !== 'PASS') {
    const e = new Error('M0 is not PASS');
    e.exitCode = 2;
    throw e;
  }
  if (gateStatus('m1').status !== 'PASS')
    log('WARNING: M1 is not PASS; an M2 result cannot be trusted until a rebuilt archive is known to load');
  const id = `m2-${path.basename(archive, path.extname(archive)).toLowerCase()}-e${entry}-o${offset}-${Date.now()}`;
  const record = {
    id,
    kind: 'M2_MUTATION',
    started: new Date().toISOString(),
    inputs: { game: path.resolve(game), archive_disc_path: archive, figure, input_script: path.resolve(script), watch },
    runs: [],
    status: 'UNKNOWN',
  };
  const session = await new GameSession(log).connect();
  try {
    const prep = await prepareMutation({ archive, entry, offset, type, value, game, id, log });
    record.rebuild = prep;
    Object.assign(record.inputs, {
      original_sha256: prep.original_sha256,
      rebuilt_sha256: prep.rebuilt_sha256,
      mutation: {
        entry_index: entry,
        offset,
        type,
        old_hex: prep.mutation.old_hex,
        new_hex: prep.mutation.new_hex,
        predicted_effect: predict,
        ...(findingId ? { finding_id: findingId } : {}),
      },
    });
    if (prep.validation.status !== 'VALID') {
      record.status = 'FAIL';
      record.failing_stage = 'verify';
      record.notes = JSON.stringify(prep.validation.failures.slice(0, 5));
      return record;
    }
    const patch = buildPatchWorkspace({
      experimentId: id,
      game,
      replacements: [{ disc_path: archive, file: prep.rebuilt, original: prep.source }],
      outDir: path.join(local, 'patches', id),
      force: true,
      displayName: `M2 ${archive} e${entry}@${offset}`,
    });
    record.inputs.patch_dir = patch.dir;
    record.inputs.descriptor = patch.descriptor;
    record.expected_monitor = monitorSize(prep.rebuilt_size);
    record.control = skipControl
      ? {
          label: 'skipped',
          pid: 0,
          started: '',
          finished: '',
          monitor_lines: [],
          screenshots: [],
          crash_or_load_error: false,
          note: 'control skipped by flag',
        }
      : await observe(session, `${id}-control`, game, { script, figure, archive, watch });
    for (let i = 1; i <= repeat; i++)
      record.runs.push(await observe(session, `${id}-run${i}`, patch.descriptor, { script, figure, archive, watch }));
    const crashed = record.runs.some(r => r.crash_or_load_error);
    record.status = crashed ? 'FAIL' : 'UNKNOWN';
    record.failing_stage = crashed ? 'observation' : null;
    record.notes = crashed
      ? 'a run crashed or lost the bridge'
      : `awaiting human judgement: run "ssa-archive experiment m2-judge --id ${id} --run <n> --observed "..." --match yes|no" for each of ${repeat} run(s)`;
    return record;
  } catch (e) {
    record.status = 'FAIL';
    record.failing_stage = record.failing_stage ?? 'rebuild';
    record.notes = e.message;
    if (e.exitCode) record.exitCode = e.exitCode;
    return record;
  } finally {
    await session.stop();
    await session.close();
    record.finished = new Date().toISOString();
    fs.mkdirSync(experimentsDir, { recursive: true });
    record.output = path.join(experimentsDir, `${id}.json`);
    saveRecord(record);
    log(`${record.status} -> ${record.output}`);
  }
}

function saveRecord(record) {
  const v = schemaValidator('experiment-record.schema.json');
  const { output, rebuild, expected_monitor, schema_valid, schema_errors, exitCode, replicates, ...strict } = record;
  record.schema_valid = v(strict);
  record.schema_errors = v.errors ?? null;
  fs.writeFileSync(record.output ?? path.join(experimentsDir, `${record.id}.json`), JSON.stringify(record, null, 2));
}

// Human judgement: records observed_effect for one run and re-evaluates the M2 rule.
// SC-004 counts repetitions of the SAME INPUT: a run recorded in another experiment whose rebuilt archive has the
// identical sha256 (and disc path) is the same input booted again, so `replicates` lets it count toward the
// repetition requirement. Only fully judged, all-matching, crash-free replicas are accepted.
export function judge({ id, run, observed, match, replicates = [], dir = experimentsDir }) {
  const file = path.join(dir, `${id}.json`);
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  let replicaRuns = 0;
  const accepted = [];
  for (const rid of replicates) {
    const other = JSON.parse(fs.readFileSync(path.join(dir, `${rid}.json`), 'utf8'));
    if (rid === id) throw new Error('an experiment cannot replicate itself');
    if (
      !record.inputs?.rebuilt_sha256 ||
      other.inputs?.rebuilt_sha256 !== record.inputs.rebuilt_sha256 ||
      other.inputs?.archive_disc_path !== record.inputs?.archive_disc_path
    )
      throw new Error(`${rid} is not the same input (rebuilt archive sha256 / disc path differ)`);
    const ok =
      other.runs.length && other.runs.every(x => x.observed_effect && x.matches_prediction && !x.crash_or_load_error);
    if (!ok) throw new Error(`${rid} is not a fully judged, all-matching, crash-free record`);
    replicaRuns += other.runs.length;
    accepted.push({ experiment_id: rid, runs: other.runs.length, rebuilt_sha256: other.inputs.rebuilt_sha256 });
  }
  if (accepted.length) record.replicates = accepted;
  const r = record.runs[run - 1];
  if (!r) throw new Error(`run ${run} does not exist (${record.runs.length} run(s))`);
  r.observed_effect = observed;
  r.matches_prediction = match;
  const judged = record.runs.filter(x => x.observed_effect);
  if (judged.length === record.runs.length) {
    const allMatch = record.runs.every(x => x.matches_prediction && !x.crash_or_load_error);
    if (!allMatch) {
      record.status = 'FAIL';
      record.failing_stage = 'observation';
      record.notes = 'observation did not match the prediction in every run; finding stays unconfirmed (FR-012)';
    } else if (record.runs.length + replicaRuns < 2) {
      record.status = 'UNKNOWN';
      record.failing_stage = null;
      record.notes =
        'predicted effect observed once; SC-004 requires the same input to be repeated at least twice before PASS (screening result)';
    } else {
      record.status = 'PASS';
      record.failing_stage = null;
      record.notes =
        `predicted effect observed in ${record.runs.length + replicaRuns}/${record.runs.length + replicaRuns} runs of the same input` +
        (replicaRuns
          ? ` (${record.runs.length} here + ${replicaRuns} in identical-input experiment(s) ${accepted.map(a => a.experiment_id).join(', ')})`
          : '');
    }
  } else record.notes = `${judged.length}/${record.runs.length} run(s) judged`;
  record.output = file;
  saveRecord(record);
  return record;
}
