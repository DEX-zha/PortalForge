// Own one research Dolphin for a finite tutorial macro or an interactive game session.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { GameSession, local } from '../experiments/run-game.mjs';
import {
  installNativePatch,
  verifyNativeFactory,
  verifyNativeInstances,
  verifyNativeLifecycle,
} from './native-run.mjs';
import {
  ensureLevelEntry,
  restoreLevelEntry,
  entrySteps,
  tutorialSteps,
  validateSkipIntro,
  directEntryConfirmed,
} from './level-entry.mjs';
import { setting } from '../../../dolphin-mcp/config.mjs';
import { isTutorial } from './levels.mjs';

export function defaultFigure() {
  const configured = setting('figure');
  const proof = path.join(local, 'dolphin-evidence/m0-proof.json');
  const known = fs.existsSync(proof) ? JSON.parse(fs.readFileSync(proof, 'utf8')).patched?.figure?.copy?.source : null;
  return [configured, known].find(f => f && fs.existsSync(f)) ?? null;
}

// `redirect` names the level actually served under `archive`'s file names (feature 006): the run then uses the
// generic redirect macro instead of the tutorial's, and records which level it was.
export async function runEditorGame({
  patch,
  archive,
  mode = 'test',
  skip_intro = false,
  figure = null,
  prediction = '',
  signal,
  onProgress = () => {},
  gameFactory = () => new GameSession(),
  evidenceDir = path.join(local, 'dolphin-evidence/editor-runs'),
  pollMs = 3000,
  entryServices = { confirmed: directEntryConfirmed, prepare: ensureLevelEntry, restore: restoreLevelEntry },
  redirect = null,
  // A campaign's view of its additions, one row each, taken at every capture of the level and at the end. With
  // it a source that fails is a result, not a failed run: the batch carries many sources and judges each.
  nativeInspect = null,
} = {}) {
  figure ??= defaultFigure();
  validateSkipIntro(archive, mode, skip_intro);
  const direct = mode === 'direct-test' || mode === 'direct-play';
  const testing = mode === 'test' || mode === 'direct-test';
  if (redirect && !direct) throw new Error('A redirected level is reached through direct entry only.');
  if (direct) {
    entrySteps(archive, { redirect });
    if (!entryServices.confirmed())
      throw Error('Direct level entry is still being validated. Use normal play or the tutorial test.');
  }
  if (!figure || !fs.existsSync(figure))
    throw new Error(
      'No Skylander figure available: choose a .sky file or configure figure in .local/dolphin-config.json',
    );
  if (mode === 'test' && !isTutorial(archive))
    throw new Error('The automatic tutorial macro only supports Level_027_Tutorial; use classic play for this level');
  const id = 'editor-' + mode + '-' + Date.now() + '-' + randomUUID().slice(0, 8);
  const record = {
    id,
    kind: 'EDITOR_PREVIEW',
    mode,
    skip_intro,
    started: new Date().toISOString(),
    patch: patch.descriptor,
    archive,
    redirect,
    figure,
    prediction,
    screenshots: [],
    trace: [],
    consumption: { verified: false },
    visual_effect: 'UNJUDGED',
  };
  const game = gameFactory();
  game.signal = signal;
  let stage = 'mcp-connect';
  let stopped, restoreNative, restoreEntry;
  // An abort can arrive while launch is still returning its PID. Do not cache a no-op
  // stop: finally must close the owned process once launch has finished assigning it.
  const stop = () => (game.pid ? (stopped ??= game.stop()) : Promise.resolve(null));
  const cancel = () => {
    onProgress({ phase: 'stopping' });
    void stop();
  };
  signal?.addEventListener('abort', cancel, { once: true });
  const consumption = () => {
    const lines = game.monitorLines(archive),
      expected = patch.expected_monitor_sizes?.[archive];
    const matched = lines.find(
      l => GameSession.normSize(GameSession.monitorSize(l)) === GameSession.normSize(expected),
    );
    record.consumption = {
      verified: !!matched && !!expected && expected !== patch.original_monitor_size,
      expected,
      lines,
    };
  };
  try {
    signal?.throwIfAborted();
    await game.connect();
    let entry;
    if (direct) {
      stage = 'entry-prepare';
      entry = await entryServices.prepare({ game, patch, archive, figure, onProgress, redirect });
      stopped = undefined;
    }
    if (patch.native_additions) {
      stage = 'native-install';
      restoreNative = await installNativePatch(patch.native_additions);
    }
    stage = 'dolphin-launch';
    onProgress({ phase: 'booting' });
    await game.launch(patch.descriptor, id);
    record.pid = game.pid;
    if (patch.native_additions) {
      stage = 'native-fingerprint';
      await verifyNativeFactory();
    }
    if (direct) {
      stage = 'entry-restore';
      onProgress({ phase: 'restoring-entry' });
      const restored = await entryServices.restore(game, entry, figure);
      restoreEntry = restored.restore;
      record.entry = restored.proof;
      if (patch.native_additions) await verifyNativeFactory();
    }
    stage = testing || direct ? 'macro' : 'playing';
    if (testing || direct) {
      const steps = direct
        ? entrySteps(archive, { skipIntro: skip_intro, interactive: !testing, redirect })
        : tutorialSteps({ skipIntro: skip_intro });
      record.trace = await game.runScriptSafe(steps, {
        figure,
        labelPrefix: id,
        onShot: async f => {
          record.screenshots.push(f);
          // Scripted additions may transform or destroy themselves, and additions on another level are judged
          // at every capture once the level is reached: both keep a timeline, not only the final state.
          const native = patch.native_additions;
          const timeline = native?.additions.some(a => a.script != null) || native?.options?.context === 'activation';
          if (nativeInspect && native && /tutorial|arrived/.test(f)) {
            record.native_samples ??= [];
            record.native_samples.push({
              capture: f,
              rows: await nativeInspect(native.additions, native.options ?? {}),
            });
          }
          if (timeline && /tutorial|arrived/.test(f)) {
            record.native_observations ??= [];
            try {
              record.native_observations.push({
                capture: f,
                ...(await verifyNativeInstances(native.additions, undefined, native.options ?? {})),
              });
            } catch (e) {
              record.native_observations.push({ capture: f, verified: false, reason: e.message });
            }
          }
        },
        onStep: step => {
          consumption();
          onProgress({ phase: 'macro', step: step.step + 1, steps: steps.length, consumption: record.consumption });
        },
      });
      consumption();
      if (!record.consumption.verified)
        throw new Error('The file monitor did not prove that Dolphin consumed this rebuilt archive');
      if (patch.native_additions && nativeInspect) {
        record.native_samples ??= [];
        record.native_samples.push({
          capture: null,
          rows: await nativeInspect(patch.native_additions.additions, patch.native_additions.options ?? {}),
        });
        try {
          record.native_additions = await verifyNativeLifecycle(
            patch.native_additions.additions,
            record.native_observations ?? [],
            undefined,
            patch.native_additions.options ?? {},
          );
        } catch (e) {
          record.native_additions = { verified: false, reason: e.message };
        }
      } else if (patch.native_additions)
        record.native_additions = await verifyNativeLifecycle(
          patch.native_additions.additions,
          record.native_observations ?? [],
          undefined,
          patch.native_additions.options ?? {},
        );
      record.status = 'MACRO_COMPLETED';
    }
    if (!testing) {
      if (!direct) await game.loadFigure(figure, 1);
      onProgress({ phase: 'playing', pid: game.pid });
      for (;;) {
        signal?.throwIfAborted();
        if (!(await game.json('dolphin_status')).pid) break;
        consumption();
        onProgress({ phase: 'playing', pid: game.pid, consumption: record.consumption });
        await sleep(pollMs, undefined, { signal });
      }
      record.status = 'CLOSED';
    }
    onProgress({ phase: 'finished', consumption: record.consumption, screenshots: record.screenshots });
    return record;
  } catch (e) {
    restoreEntry ??= e.restoreEntry;
    record.failed_stage = stage;
    record.error_code = e.code ?? null;
    if (['mcp-connect', 'dolphin-launch'].includes(stage) && /\bspawn\b.*\b(?:EPERM|EACCES)\b/i.test(e.message)) {
      const original = e.message;
      const component = stage === 'mcp-connect' ? 'MCP server' : 'Dolphin';
      e.message = `Cannot start ${component} (${original}). Restart the editor server from a Windows terminal allowed to create processes, then retry the test. The saved patch is preserved.`;
      record.original_error = original;
    }
    record.status = signal?.aborted ? 'STOPPED' : 'FAILED';
    record.error = e.message;
    record.trace = e.trace ?? record.trace;
    if (signal?.aborted) return record;
    throw e;
  } finally {
    signal?.removeEventListener('abort', cancel);
    try {
      record.stop = await stop();
    } finally {
      await game.close();
      if (restoreNative && (!game.pid || record.stop?.stopped)) {
        restoreNative();
        record.native_profile_restored = true;
      } else if (restoreNative) record.native_profile_restored = false;
      if (restoreEntry && (!game.pid || record.stop?.stopped)) {
        restoreEntry();
        record.entry_slot_restored = true;
      }
    }
    record.finished = new Date().toISOString();
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, id + '.json'), JSON.stringify(record, null, 2));
  }
}
