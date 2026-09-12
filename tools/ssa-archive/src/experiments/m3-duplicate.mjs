// M3 entity duplication experiment (spec 002 FR-007): rebuild the archive with a cloned decoded
// entry (plan from igz clone), patch, run the control and `repeat` identical patched runs; judged with
// experiment m2-judge (PASS needs every run to match and at least two repeats).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { GameSession, gameFromConfig, readScript, defaultScript, experimentsDir, gateStatus, local } from './run-game.mjs';
import { extractFile, samplePath } from '../disc/extract.mjs';
import { extractToWorkspace, readManifest, schemaValidator } from '../workspace/manifest.mjs';
import { verifyBuffer } from '../iga/verify.mjs';
import { rebuildFromWorkspace } from '../iga/writer.mjs';
import { diffArchives } from '../iga/diff.mjs';
import { buildPatchWorkspace, monitorSize } from '../patch/riivolution.mjs';
import { decodeWorkspace, reencodeEntry } from '../iga/decode.mjs';

const sha256 = b => createHash('sha256').update(b).digest('hex');
const samplesRoot = path.join(local, 'samples');

// probes: [{label, pattern (hex), header_delta}] — after the script, MEM1 is searched for each pattern
// and the object header (pattern address - header_delta, 16 bytes) is read back: a header whose type
// word became a class pointer (0x8048xxxx) proves the loader visited that object (finding
// igz.loader.pointer-traversal).
async function probeMemory(session, probes, log) {
  const reads = [];
  if (!probes.length) return reads;
  const { scanRam } = await import('./live-probe.mjs');
  const { bridgeCall } = await import('../../../dolphin-mcp/runtime.mjs');
  let scan;
  try { scan = await scanRam(probes.map(p => p.pattern), { log, regions: [[0x80000000, 0x81800000]] }); }
  catch (e) { return [{ error: 'scan failed: ' + e.message }]; }
  for (let i = 0; i < probes.length; i++) {
    const p = probes[i];
    const hits = scan[i].matches.slice(0, 40);
    // Items follow the experiment-record schema (address: integer, bytes_hex) plus probe annotations.
    const headers = [];
    for (const h of hits) {
      const addr = parseInt(h, 16) - (p.header_delta ?? 0);
      try { const hex = await bridgeCall('memory.read_bytes', [addr, 16], 30000); const w0 = parseInt(hex.slice(0, 8), 16); headers.push({ address: addr, bytes_hex: hex, label: p.label, pattern: p.pattern, hits: scan[i].matches.length, visited: w0 >= 0x80000000 && w0 < 0x81800000 }); }
      catch (e) { headers.push({ address: addr, bytes_hex: '', label: p.label, pattern: p.pattern, hits: scan[i].matches.length, error: e.message }); }
    }
    if (!hits.length) headers.push({ address: 0, bytes_hex: '', label: p.label, pattern: p.pattern, hits: 0 });
    log(`probe ${p.label}: ${scan[i].matches.length} hit(s)${headers.length ? ', headers ' + headers.map(h => h.bytes_hex ? h.bytes_hex.slice(0, 8) + (h.visited ? ' visited' : ' raw') : '-').join(' | ') : ''}`);
    reads.push(...headers);
  }
  return reads;
}

async function observe(session, label, target, { script, figure, archive, probes = [], log = console.log }) {
  const run = { label, target, monitor_lines: [], screenshots: [], log_excerpt: [], memory_reads: [], crash_or_load_error: false, observed_effect: '' };
  await session.launch(target, label);
  run.pid = session.pid; run.started = session.startedAt;
  try { run.trace = await session.runScriptSafe(readScript(script), { labelPrefix: label, onShot: f => run.screenshots.push(f), figure }); }
  catch (e) { run.crash_or_load_error = true; run.error = e.message; run.trace = e.trace ?? []; }
  if (!run.crash_or_load_error && probes.length) run.memory_reads = await probeMemory(session, probes, log);
  run.monitor_lines = session.monitorLines(archive);
  try { await session.call('dolphin_ping'); } catch { run.crash_or_load_error = true; }
  run.log_excerpt = session.logSince().split(/\r?\n/).filter(l => /FileMon|PanicAlert|Fatal|Unable|Invalid/i.test(l)).slice(-40);
  run.finished = new Date().toISOString(); run.stop = await session.stop();
  return run;
}

export async function runM3({ archive, entry, planFile, clonedFile, predict, repeat = 2, figure = null, script = defaultScript, game = gameFromConfig(), skipControl = false, probes = [], log = console.log }) {
  for (const g of ['m0', 'm1', 'm2']) if (gateStatus(g).status !== 'PASS') { const e = new Error(`${g.toUpperCase()} is not PASS`); e.exitCode = 2; throw e; }
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  if (plan.validation?.status !== 'VALID') { const e = new Error('Duplication plan is not VALID'); e.exitCode = 1; throw e; }
  const id = `m3-${path.basename(archive, path.extname(archive)).toLowerCase()}-e${entry}-${Date.now()}`;
  const record = { id, kind: 'M2_MUTATION', started: new Date().toISOString(), inputs: { game: path.resolve(game), archive_disc_path: archive, figure, input_script: path.resolve(script), duplication: plan, gate: 'M3' }, runs: [], status: 'UNKNOWN' };
  const session = await new GameSession(log).connect();
  try {
    let source = samplePath(samplesRoot, archive);
    if (!fs.existsSync(source)) source = (await extractFile(game, archive, samplesRoot)).file;
    const original = fs.readFileSync(source);
    const wsDir = path.join(local, 'workspaces', id); fs.rmSync(wsDir, { recursive: true, force: true });
    extractToWorkspace(original, { discPath: archive, sourceFile: source, outDir: wsDir });
    await decodeWorkspace(wsDir);
    const built = rebuildFromWorkspace(wsDir, { replacements: { [entry]: path.resolve(clonedFile ?? plan.output) }, reencode: reencodeEntry });
    const { parsed, ...validation } = verifyBuffer(built.buffer);
    const diff = diffArchives(original, built.buffer);
    const rebuilt = path.join(wsDir, `rebuilt-m3${path.extname(archive)}`); fs.writeFileSync(rebuilt, built.buffer);
    record.rebuild = { workspace: wsDir, rebuilt, rebuilt_size: built.buffer.length, original_size: original.length, strategy: built.strategy, validation, diff: { size_delta: diff.size_delta, unclassified_bytes: diff.unclassified_bytes, regions: diff.regions.length } };
    Object.assign(record.inputs, { original_sha256: sha256(original), rebuilt_sha256: sha256(built.buffer), mutation: { entry_index: entry, offset: plan.insert_at, type: 'u8', old_hex: '', new_hex: '', predicted_effect: predict, finding_id: plan.source.finding_id } });
    if (validation.status !== 'VALID') { record.status = 'FAIL'; record.failing_stage = 'verify'; record.notes = JSON.stringify(validation.failures.slice(0, 5)); return record; }
    const patch = buildPatchWorkspace({ experimentId: id, game, replacements: [{ disc_path: archive, file: rebuilt, original: source }], outDir: path.join(local, 'patches', id), force: true, displayName: `M3 ${archive} clone` });
    record.inputs.patch_dir = patch.dir; record.inputs.descriptor = patch.descriptor; record.expected_monitor = monitorSize(built.buffer.length);
    record.inputs.probes = probes;
    record.control = skipControl ? { label: 'skipped', pid: 0, started: '', finished: '', monitor_lines: [], screenshots: [], crash_or_load_error: false, note: 'control skipped by flag' } : await observe(session, `${id}-control`, game, { script, figure, archive, probes, log });
    for (let i = 1; i <= repeat; i++) record.runs.push(await observe(session, `${id}-run${i}`, patch.descriptor, { script, figure, archive, probes, log }));
    const crashed = record.runs.some(r => r.crash_or_load_error);
    record.status = crashed ? 'FAIL' : 'UNKNOWN'; record.failing_stage = crashed ? 'load' : null;
    record.notes = crashed ? 'a run crashed or lost the bridge with the cloned level' : `awaiting human judgement (experiment m2-judge --id ${id} --run <n> ...)`;
    return record;
  } catch (e) { record.status = 'FAIL'; record.failing_stage = record.failing_stage ?? 'rebuild'; record.notes = e.message; if (e.exitCode) record.exitCode = e.exitCode; return record; }
  finally {
    await session.stop(); await session.close();
    record.finished = new Date().toISOString();
    fs.mkdirSync(experimentsDir, { recursive: true });
    record.output = path.join(experimentsDir, `${id}.json`);
    const v = schemaValidator('experiment-record.schema.json');
    const { output, rebuild, expected_monitor, exitCode, ...strict } = record;
    record.schema_valid = v(strict); record.schema_errors = v.errors ?? null;
    fs.writeFileSync(record.output, JSON.stringify(record, null, 2));
    log(`${record.status} -> ${record.output}`);
  }
}
