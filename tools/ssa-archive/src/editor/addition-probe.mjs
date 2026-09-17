// Bounded research run, independent of the edited scene. Technical results never
// mark a candidate CONFIRMED; rendering and gameplay evidence remain separate.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { GameSession, gameFromConfig, defaultScript, readScript } from '../experiments/run-game.mjs';
import { defaultFigure } from './dolphin-run.mjs';
import { compileNativeProbe } from './native-patch.mjs';
import { installNativePatch, verifyNativeFactory, inspectAdditions } from './native-run.mjs';
import { classifyAddition, PROBE_VERSION } from './addition-compatibility.mjs';
import { sha256 as hash } from '../util/hash.mjs';
import { reportsDir } from './addition-reports.mjs';
import { ORIGINAL_TUTORIAL_SHA256, isTutorial } from './levels.mjs';
export { reportsDir };
export function readFamilyReport(family) {
  if (!/^[a-f0-9]{64}$/.test(family ?? '')) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(reportsDir, family + '.json'), 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}
// Kept under its first name for the tutorial probe; the launcher and the campaigns use it as inspectAdditions.
export const inspectProbe = inspectAdditions;
export async function runAdditionProbe(
  s,
  sources,
  { signal, onProgress = () => {}, repeat = 2, gameFactory = () => new GameSession() } = {},
) {
  if (!isTutorial(s.archive))
    throw Error(
      'On this level, source families are tested in batches through the level itself: run research-probes/native-level-probe.mjs.',
    );
  if (s.original_sha256 !== ORIGINAL_TUTORIAL_SHA256)
    throw Error(
      'This probe currently requires the original tutorial level. Open the unmodified tutorial to test its source families.',
    );
  if (!Array.isArray(sources) || !sources.length || sources.length > 2 || new Set(sources).size !== sources.length)
    throw Error('Choose one or two source objects for a test batch.');
  if (![1, 2].includes(repeat)) throw Error('A test batch supports one or two cold boots.');
  const candidates = sources.map(offset => {
    const p = s.placements.find(p => p.offset === offset);
    if (!p) throw Error('Source missing.');
    const c = classifyAddition(s, p);
    if (!c.testable) throw Error(c.reason);
    return { p, c };
  });
  const additions = candidates.map(({ p }, i) => ({
    id: -i - 1,
    source: p.offset,
    model: p.model.offset,
    script: p.behavior?.offset ?? null,
    position: [
      [90, 10.5, 48],
      [88, 10.5, 43],
    ][i],
    heading: p.rotation.heading,
    scale: 100,
  }));
  const code = compileNativeProbe(additions),
    id = 'batch-' + Date.now() + '-' + randomUUID().slice(0, 8),
    dir = path.join(reportsDir, id);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'probe.ini');
  fs.writeFileSync(file, code.ini);
  const record = {
    id,
    version: PROBE_VERSION,
    started: new Date().toISOString(),
    source_sha256: s.original_sha256,
    additions,
    candidates: candidates.map(({ p, c }) => ({ source: p.offset, name: p.name, family: c.family })),
    sha256: hash(code.ini),
    runs: [],
    status: 'running',
  };
  const persist = () => fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(record, null, 2));
  persist();
  try {
    for (let n = 0; n < repeat; n++) {
      signal?.throwIfAborted();
      const game = gameFactory();
      game.signal = signal;
      let restore;
      const run = { started: new Date().toISOString(), screenshots: [], samples: [] };
      record.runs.push(run);
      try {
        await game.connect();
        restore = await installNativePatch(
          { file, sha256: record.sha256, additions },
          { compiler: compileNativeProbe },
        );
        onProgress({ phase: 'booting', run: n + 1, runs: repeat });
        await game.launch(gameFromConfig(), id);
        run.pid = game.pid;
        await verifyNativeFactory();
        run.trace = await game.runScriptSafe(readScript(defaultScript), {
          figure: defaultFigure(),
          labelPrefix: id + '-' + n,
          onShot: async f => {
            run.screenshots.push(f);
            if (/tutorial/.test(f)) {
              const rows = await inspectProbe(additions);
              run.samples.push(rows.map(row => ({ ...row, capture: f })));
            }
          },
          onStep: step => onProgress({ phase: 'macro', run: n + 1, runs: repeat, step: step.step + 1 }),
        });
        run.samples.push(await inspectProbe(additions));
        run.status = 'completed';
        run.monitor_lines = game.monitorLines('level/Level_027_Tutorial.bld');
      } catch (e) {
        run.status = signal?.aborted ? 'cancelled' : 'failed';
        run.error = e.message;
        run.trace = e.trace ?? run.trace;
        throw e;
      } finally {
        run.stop = await game.stop();
        await game.close();
        if (restore && (!game.pid || run.stop?.stopped)) {
          restore();
          run.profile_restored = true;
        }
        run.finished = new Date().toISOString();
        persist();
      }
      if (restore && !run.profile_restored)
        throw Error('The test Dolphin did not stop cleanly; its temporary profile has been retained for recovery.');
    }
    record.status = 'completed';
  } catch (e) {
    record.status = signal?.aborted ? 'cancelled' : 'failed';
    record.error = e.message;
  } finally {
    record.finished = new Date().toISOString();
    persist();
    for (const { p, c } of candidates) {
      const rows = record.runs.map(r => r.samples.at(-1)?.find(x => x.source === p.offset));
      const passed =
        record.status === 'completed' && rows.length === repeat && rows.every(r => r?.runtime === 'passed');
      const observed = record.runs.some(r =>
        r.samples.some(sample => sample.some(row => row.source === p.offset && row.runtime === 'passed')),
      );
      const report = {
        version: PROBE_VERSION,
        family: c.family,
        source: p.offset,
        name: p.name,
        runtime: passed
          ? 'passed'
          : record.status === 'cancelled'
            ? 'cancelled'
            : rows.some(r => r?.runtime === 'inconclusive')
              ? 'inconclusive'
              : 'failed',
        observed_live: observed,
        visual: 'pending',
        gameplay: 'pending',
        runs: record.runs.length,
        reason: passed
          ? 'Native creation passed in every run; visual and gameplay review pending.'
          : observed
            ? 'A matching live actor was observed earlier, but did not survive the full macro. Review the capture timeline and object lifecycle.'
            : (rows.find(r => r?.runtime !== 'passed')?.reason ?? record.error ?? 'No complete native result.'),
        batch: id,
        updated: record.finished,
      };
      fs.writeFileSync(path.join(reportsDir, c.family + '.json'), JSON.stringify(report, null, 2));
    }
  }
  return record;
}
