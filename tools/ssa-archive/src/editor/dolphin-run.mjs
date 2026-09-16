// Own one research Dolphin for a finite tutorial macro or an interactive game session.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { GameSession, defaultScript, readScript, local } from '../experiments/run-game.mjs';
import { installNativePatch, verifyNativeFactory, verifyNativeInstances, verifyNativeLifecycle } from './native-run.mjs';

export function defaultFigure() {
  const config = path.join(local, 'dolphin-config.json');
  const configured = fs.existsSync(config) ? JSON.parse(fs.readFileSync(config, 'utf8')).figure : null;
  const proof = path.join(local, 'dolphin-evidence/m0-proof.json');
  const known = fs.existsSync(proof) ? JSON.parse(fs.readFileSync(proof, 'utf8')).patched?.figure?.copy?.source : null;
  return [configured, known].find(f => f && fs.existsSync(f)) ?? null;
}

export async function runEditorGame({ patch, archive, mode = 'test', figure = null, prediction = '', signal,
  onProgress = () => {}, gameFactory = () => new GameSession(), evidenceDir = path.join(local, 'dolphin-evidence/editor-runs'), pollMs = 3000 } = {}) {
  figure ??= defaultFigure();
  if (!figure || !fs.existsSync(figure)) throw new Error('No Skylander figure available: choose a .sky file or configure figure in .local/dolphin-config.json');
  if (mode === 'test' && archive.toLowerCase() !== 'level/level_027_tutorial.bld') throw new Error('The automatic tutorial macro only supports Level_027_Tutorial; use classic play for this level');
  const id = 'editor-' + mode + '-' + Date.now() + '-' + randomUUID().slice(0, 8);
  const record = { id, kind: 'EDITOR_PREVIEW', mode, started: new Date().toISOString(), patch: patch.descriptor,
    archive, figure, prediction, screenshots: [], trace: [], consumption: { verified: false }, visual_effect: 'UNJUDGED' };
  const game = gameFactory(); game.signal = signal;
  let stage = 'mcp-connect';
  let stopped, restoreNative;
  // An abort can arrive while launch is still returning its PID. Do not cache a no-op
  // stop: finally must close the owned process once launch has finished assigning it.
  const stop = () => game.pid ? stopped ??= game.stop() : Promise.resolve(null);
  const cancel = () => { onProgress({ phase: 'stopping' }); void stop(); };
  signal?.addEventListener('abort', cancel, { once: true });
  const consumption = () => {
    const lines = game.monitorLines(archive), expected = patch.expected_monitor_sizes?.[archive];
    const matched = lines.find(l => GameSession.normSize(GameSession.monitorSize(l)) === GameSession.normSize(expected));
    record.consumption = { verified: !!matched && !!expected && expected !== patch.original_monitor_size, expected, lines };
  };
  try {
    signal?.throwIfAborted(); await game.connect();
    if (patch.native_additions) { stage = 'native-install'; restoreNative = await installNativePatch(patch.native_additions); }
    stage = 'dolphin-launch';
    onProgress({ phase: 'booting' }); await game.launch(patch.descriptor, id);
    record.pid = game.pid;
    if (patch.native_additions) { stage = 'native-fingerprint'; await verifyNativeFactory(); }
    stage = mode === 'test' ? 'macro' : 'playing';
    if (mode === 'test') {
      const steps = readScript(defaultScript);
      record.trace = await game.runScriptSafe(steps, { figure, labelPrefix: id,
        onShot: async f => {
          record.screenshots.push(f);
          if(patch.native_additions?.additions.some(a=>a.script!=null)&&/tutorial/.test(f)) {
            record.native_observations??=[];
            try {record.native_observations.push({capture:f,...await verifyNativeInstances(patch.native_additions.additions)});}
            catch(e){record.native_observations.push({capture:f,verified:false,reason:e.message});}
          }
        },
        onStep: step => { consumption(); onProgress({ phase: 'macro', step: step.step + 1, steps: steps.length, consumption: record.consumption }); } });
      consumption();
      if (!record.consumption.verified) throw new Error('The file monitor did not prove that Dolphin consumed this rebuilt archive');
      if (patch.native_additions) record.native_additions = await verifyNativeLifecycle(patch.native_additions.additions,record.native_observations??[]);
      record.status = 'MACRO_COMPLETED';
    } else {
      await game.loadFigure(figure, 1);
      onProgress({ phase: 'playing', pid: game.pid });
      for (;;) {
        signal?.throwIfAborted();
        if (!(await game.json('dolphin_status')).pid) break;
        consumption(); onProgress({ phase: 'playing', pid: game.pid, consumption: record.consumption });
        await sleep(pollMs, undefined, { signal });
      }
      record.status = 'CLOSED';
    }
    onProgress({ phase: 'finished', consumption: record.consumption, screenshots: record.screenshots });
    return record;
  } catch (e) {
    record.failed_stage = stage;
    record.error_code = e.code ?? null;
    if (['mcp-connect', 'dolphin-launch'].includes(stage) && /\bspawn\b.*\b(?:EPERM|EACCES)\b/i.test(e.message)) {
      const original = e.message;
      const component = stage === 'mcp-connect' ? 'MCP server' : 'Dolphin';
      e.message = `Cannot start ${component} (${original}). Restart the editor server from a Windows terminal allowed to create processes, then retry the test. The saved patch is preserved.`;
      record.original_error = original;
    }
    record.status = signal?.aborted ? 'STOPPED' : 'FAILED'; record.error = e.message; record.trace = e.trace ?? record.trace;
    if (signal?.aborted) return record;
    throw e;
  } finally {
    signal?.removeEventListener('abort', cancel);
    try { record.stop = await stop(); }
    finally {
      await game.close();
      if (restoreNative && (!game.pid || record.stop?.stopped)) { restoreNative(); record.native_profile_restored = true; }
      else if (restoreNative) record.native_profile_restored = false;
    }
    record.finished = new Date().toISOString();
    fs.mkdirSync(evidenceDir, { recursive: true }); fs.writeFileSync(path.join(evidenceDir, id + '.json'), JSON.stringify(record, null, 2));
  }
}
