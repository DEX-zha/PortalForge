// M1 archive round-trip experiment (FR-008, SC-002, SC-003).
// Pipeline: extract -> verify -> rebuild (variant) -> verify -> diff -> patch workspace ->
//           control boot (plain dump) -> patched boot (descriptor) -> input script to the level ->
//           consumption proof (file monitor size of the served archive) -> captures -> stop.
// Variants: 'identical' (byte-preserving), 'sequential' (entries relaid + one padding block, .arc),
//           'reencode' (every LZMA entry re-encoded, .bld). The variant decides what the game proves.
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

const sha256 = b => createHash('sha256').update(b).digest('hex');
const samplesRoot = path.join(local, 'samples');

export async function prepareRebuild({ archive, variant, game, id, log = console.log }) {
  let source = samplePath(samplesRoot, archive);
  if (!fs.existsSync(source)) {
    log(`extracting ${archive} from the dump`);
    source = (await extractFile(game, archive, samplesRoot)).file;
  }
  const original = fs.readFileSync(source);
  const wsDir = path.join(local, 'workspaces', id);
  fs.rmSync(wsDir, { recursive: true, force: true });
  const manifest = extractToWorkspace(original, { discPath: archive, sourceFile: source, outDir: wsDir });
  const hasLzma = manifest.entries.some(e => e.compression === 'LZMA_CHUNKED');
  const opts = {};
  if (variant === 'sequential') {
    opts.layout = 'sequential';
    opts.padUnits = 1;
  }
  if (variant === 'reencode') {
    if (!hasLzma) throw new Error('variant reencode needs LZMA-chunked entries');
    const { reencodeStoredEntry } = await import('../iga/decode.mjs');
    opts.transformAll = reencodeStoredEntry;
  }
  const built = rebuildFromWorkspace(wsDir, opts);
  const { parsed, ...validation } = verifyBuffer(built.buffer);
  const diff = diffArchives(original, built.buffer);
  const rebuiltPath = path.join(wsDir, `rebuilt-${variant}${path.extname(archive)}`);
  fs.writeFileSync(rebuiltPath, built.buffer);
  return {
    source,
    original_sha256: sha256(original),
    original_size: original.length,
    workspace: wsDir,
    rebuilt: rebuiltPath,
    rebuilt_sha256: sha256(built.buffer),
    rebuilt_size: built.buffer.length,
    strategy: built.strategy,
    layout: built.layout,
    transformed_entries: built.transformed_entries,
    validation,
    diff: {
      size_delta: diff.size_delta,
      unclassified_bytes: diff.unclassified_bytes,
      summary: diff.summary,
      regions: diff.regions.length,
    },
  };
}

async function observeRun(session, label, target, { script, figure, archive, patchedPaths }) {
  const run = {
    label,
    target,
    monitor_lines: [],
    screenshots: [],
    log_excerpt: [],
    memory_reads: [],
    crash_or_load_error: false,
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
    run.figure = run.trace.find(t => t.figure)?.note ?? null;
  } catch (e) {
    run.crash_or_load_error = true;
    run.error = e.message;
    run.trace = e.trace ?? [];
  }
  for (const p of new Set([archive, ...patchedPaths])) run.monitor_lines.push(...session.monitorLines(p));
  try {
    await session.call('dolphin_ping');
    run.responsive_after_script = true;
  } catch {
    run.responsive_after_script = false;
    run.crash_or_load_error = true;
  }
  run.log_excerpt = session
    .logSince()
    .split(/\r?\n/)
    .filter(l => /FileMon|Skylander|Portal|1430:0150|PanicAlert|Fatal|Unable|Invalid read/i.test(l))
    .slice(-60);
  run.finished = new Date().toISOString();
  run.stop = await session.stop();
  return run;
}

export async function runM1({
  archive,
  variant = null,
  figure = null,
  script = defaultScript,
  game = gameFromConfig(),
  skipControl = false,
  log = console.log,
}) {
  if (gateStatus('m0').status !== 'PASS') {
    const e = new Error('M0 is not PASS; see docs/m0-status.json');
    e.exitCode = 2;
    throw e;
  }
  const ext = path.extname(archive).toLowerCase();
  variant = variant ?? (ext === '.bld' ? 'reencode' : 'sequential');
  const id = `m1-${path.basename(archive, ext).toLowerCase()}-${variant}-${Date.now()}`;
  const record = {
    id,
    kind: 'M1_ROUNDTRIP',
    started: new Date().toISOString(),
    inputs: {
      game: path.resolve(game),
      archive_disc_path: archive,
      variant,
      figure,
      input_script: path.resolve(script),
    },
    runs: [],
    status: 'UNKNOWN',
  };
  const session = await new GameSession(log).connect();
  try {
    const prep = await prepareRebuild({ archive, variant, game, id, log });
    Object.assign(record.inputs, { original_sha256: prep.original_sha256, rebuilt_sha256: prep.rebuilt_sha256 });
    record.rebuild = prep;
    if (prep.validation.status !== 'VALID') {
      record.status = 'FAIL';
      record.failing_stage = 'verify';
      record.notes = JSON.stringify(prep.validation.failures.slice(0, 5));
      return record;
    }
    if (prep.diff.unclassified_bytes > 0) {
      record.status = 'FAIL';
      record.failing_stage = 'diff';
      record.notes = `${prep.diff.unclassified_bytes} unclassified bytes`;
      return record;
    }

    const patch = buildPatchWorkspace({
      experimentId: id,
      game,
      replacements: [{ disc_path: archive, file: prep.rebuilt, original: prep.source }],
      outDir: path.join(local, 'patches', id),
      force: true,
      displayName: `M1 ${archive} ${variant}`,
    });
    record.inputs.patch_dir = patch.dir;
    record.inputs.descriptor = patch.descriptor;
    record.expected = {
      original_monitor: monitorSize(prep.original_size),
      rebuilt_monitor: monitorSize(prep.rebuilt_size),
      size_differs: prep.original_size !== prep.rebuilt_size,
    };

    if (!skipControl)
      record.control = await observeRun(session, `${id}-control`, game, { script, figure, archive, patchedPaths: [] });
    else
      record.control = {
        label: 'skipped',
        pid: 0,
        started: '',
        finished: '',
        monitor_lines: [],
        screenshots: [],
        crash_or_load_error: false,
        note: 'control skipped by flag',
      };
    const patched = await observeRun(session, `${id}-patched`, patch.descriptor, {
      script,
      figure,
      archive,
      patchedPaths: [archive],
    });
    record.runs.push(patched);

    // Decision (FR-008): the level archive must have been served from the patch, the game must
    // stay responsive and reach the level, and nothing may indicate a load error.
    const N = GameSession.normSize;
    const served = patched.monitor_lines.map(GameSession.monitorSize).filter(Boolean).map(N);
    const controlServed = (record.control.monitor_lines ?? []).map(GameSession.monitorSize).filter(Boolean).map(N);
    const expectedRebuilt = N(record.expected.rebuilt_monitor),
      expectedOriginal = N(record.expected.original_monitor);
    record.consumption = {
      patched_sizes: served,
      control_sizes: controlServed,
      expected_patched: expectedRebuilt,
      expected_original: expectedOriginal,
    };
    const consumed =
      served.includes(expectedRebuilt) && (!record.expected.size_differs || !served.includes(expectedOriginal));
    const reached = patched.trace?.some(t => t.wait_monitor === archive || (t.wait_monitor && t.note)) ?? false;
    if (patched.crash_or_load_error) {
      record.status = 'FAIL';
      record.failing_stage = patched.error?.includes('monitor') ? 'level_entry' : 'boot';
      record.notes = patched.error ?? 'game unresponsive after the script';
    } else if (!served.length) {
      record.status = 'FAIL';
      record.failing_stage = 'consumption';
      record.notes = `file monitor never reported ${archive} in the patched run`;
    } else if (!consumed && record.expected.size_differs) {
      record.status = 'FAIL';
      record.failing_stage = 'consumption';
      record.notes = `served ${[...new Set(served)].join('/')} but expected ${expectedRebuilt}`;
    } else if (!record.expected.size_differs) {
      record.status = 'UNKNOWN';
      record.failing_stage = 'consumption';
      record.notes =
        'rebuilt archive has the original size: the file monitor cannot distinguish it; use variant sequential or reencode';
    } else {
      record.status = 'PASS';
      record.notes = `served ${expectedRebuilt} (control ${[...new Set(controlServed)].join('/') || 'n/a'}), level reached=${reached}, screenshots=${patched.screenshots.length}`;
    }
    if (record.status === 'PASS' && !patched.screenshots.length) {
      record.status = 'UNKNOWN';
      record.notes += '; no screenshot captured';
    }
    return record;
  } catch (e) {
    record.status = 'FAIL';
    record.failing_stage = record.failing_stage ?? 'boot';
    record.notes = e.message;
    if (e.exitCode) record.exitCode = e.exitCode;
    return record;
  } finally {
    await session.stop();
    await session.close();
    record.finished = new Date().toISOString();
    fs.mkdirSync(experimentsDir, { recursive: true });
    record.output = path.join(experimentsDir, `${id}.json`);
    const v = schemaValidator('experiment-record.schema.json');
    const { output, rebuild, expected, consumption, ...strict } = record;
    record.schema_valid = v(strict);
    record.schema_errors = v.errors ?? null;
    fs.writeFileSync(record.output, JSON.stringify(record, null, 2));
    log(`${record.status} -> ${record.output}`);
  }
}
