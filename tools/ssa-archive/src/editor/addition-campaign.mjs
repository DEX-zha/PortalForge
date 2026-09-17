// Batch validation of native additions on any level (feature 007, phase V): many sources in one boot, each
// judged by the machine from the running game's memory, instead of one source per pair of boots by hand.
//
// A batch uses the editor's own builder and launcher and nothing else: the unedited level is rebuilt into a patch
// (with the redirect that loads it through the tutorial checkpoint) and launched; the additions ride along as the
// Gecko companion, compiled with the level's own base and anchor (native-params.mjs). The session is left as it
// was: a batch is a measurement, not a save. Each addition is inspected at every capture of the level and at the
// end (addition-probe.mjs `inspectProbe`): class, state, actor, parent, model, script and the transform that was
// asked for.
//
// A batch result never makes anything editable. It writes one report per family, which the catalogue shows as
// "Visual check pending", and findings stay a human decision on two identical boots.
import fs from 'node:fs';
import path from 'node:path';
import { classifyAddition, groupCandidates, PROBE_VERSION } from './addition-compatibility.mjs';
import { compileNativeProbe, nativeCapacity } from './native-patch.mjs';
import { nativeParamsFor } from './native-params.mjs';
import { inspectProbe, reportsDir } from './addition-probe.mjs';
import { redirectFor } from './save.mjs';
import { sha256 as hash } from '../util/hash.mjs';
import { isTutorial } from './levels.mjs';
import { local } from '../experiments/run-game.mjs';

export const campaignsDir = path.join(local, 'addition-campaigns');

const levelSlug = archive =>
  String(archive)
    .replace(/^.*\//, '')
    .replace(/\.[^.]+$/, '')
    .toLowerCase();

// One representative per testable family, nearest to `origin` first: a source the player is close to is active
// (or its template is resident) when the additions are created, and the batch stands where the captures look.
export function campaignSources(session, { origin, count, exclude = [] } = {}) {
  const distance = p => Math.hypot(p.position[0] - origin[0], p.position[2] - origin[2]);
  const byOffset = new Map(session.placements.map(p => [p.offset, p]));
  const skip = new Set(exclude);
  return groupCandidates(session)
    .filter(family => !skip.has(family.family))
    .map(family => {
      const members = family.members.map(o => byOffset.get(o)).sort((a, b) => distance(a) - distance(b));
      return { family: family.family, placement: members[0], distance: distance(members[0]) };
    })
    .sort((a, b) => a.distance - b.distance || a.placement.offset - b.placement.offset)
    .slice(0, count)
    .map(row => row.placement.offset);
}

// The additions of a batch: each source copied onto a grid that starts at `origin` and grows along x then z,
// all at the origin's height. Identities are negative and unique, as the recipe requires.
export function batchAdditions(session, sources, { origin, spacing = 2.5, columns = 8 } = {}) {
  if (!Array.isArray(origin) || origin.length !== 3 || origin.some(n => !Number.isFinite(n)))
    throw Error('A batch needs an origin: three finite numbers.');
  if (!Array.isArray(sources) || !sources.length || new Set(sources).size !== sources.length)
    throw Error('A batch needs distinct source offsets.');
  return sources.map((offset, i) => {
    const placement = session.placements.find(p => p.offset === offset);
    if (!placement) throw Error(`No placement at 0x${Number(offset).toString(16)}.`);
    const verdict = classifyAddition(session, placement);
    if (!verdict.testable) throw Error(`${placement.name}: ${verdict.reason}`);
    return {
      id: -i - 1,
      source: placement.offset,
      model: placement.model.offset,
      script: placement.behavior?.offset ?? null,
      position: [
        Math.fround(origin[0] + (i % columns) * spacing),
        Math.fround(origin[1]),
        Math.fround(origin[2] + Math.floor(i / columns) * spacing),
      ],
      heading: Math.fround(placement.rotation.heading),
      scale: 100,
    };
  });
}

// What one boot says about each source: `passed` when the final inspection found a live, distinct instance that
// matches the request; `observed` when an earlier capture did but the end did not (a script may have transformed
// or destroyed it); `failed` otherwise, with the reason of the last inspection.
export function judgeRun(additions, samples = []) {
  const last = samples.at(-1)?.rows ?? [];
  return additions.map(addition => {
    const final = last.find(row => row.id === addition.id) ?? null;
    const seen = samples.some(sample => sample.rows.some(row => row.id === addition.id && row.runtime === 'passed'));
    const runtime = final?.runtime === 'passed' ? 'passed' : seen ? 'observed' : 'failed';
    return {
      id: addition.id,
      source: addition.source,
      runtime,
      reason: final?.reason ?? 'The batch was never inspected.',
      verification_error: final?.verification_error ?? null,
      state: final?.state ?? null,
      actor: final?.actor ?? null,
      position: final?.position ?? null,
    };
  });
}

export async function runLevelBatch(
  session,
  { sources, origin, spacing, columns, layout = 'slot', mode = null, deps, prediction = '', log = () => {} } = {},
) {
  if (session.dirty || session.edits.length || hash(session.buffer) !== session.original_sha256)
    throw Error('A batch runs on the unedited level: reset the scene before testing sources.');
  if (session.additions?.length) throw Error('A batch runs without scene additions: remove them first.');
  const params = nativeParamsFor(session);
  if (!params.available) throw Error(params.reason);

  const additions = batchAdditions(session, sources, { origin, spacing, columns });
  const options = { ...params.options, layout, limit: additions.length };
  const capacity = nativeCapacity(options, { scripted: true });
  if (additions.length > capacity)
    throw Error(`This layout holds ${capacity} additions in one patch; the batch asks for ${additions.length}.`);
  const recipe = compileNativeProbe(additions, options);

  const tutorial = isTutorial(session.archive);
  mode ??= tutorial ? 'test' : 'direct-test';
  const slug = levelSlug(session.archive);
  const dir = path.join(campaignsDir, slug);
  fs.mkdirSync(dir, { recursive: true });
  const unedited = path.join(dir, `${slug}.batch.decoded`);
  fs.writeFileSync(unedited, session.buffer);
  const built = deps.build({
    experimentId: `batch-${slug}-${Date.now()}`,
    replacements: [{ disc_path: session.archive, file: unedited }],
    entry: session.entry,
    session,
    redirect: redirectFor(session),
  });
  if (!tutorial && !built.redirect)
    throw Error('This level cannot be reached automatically: its voice pack is not extracted.');

  const file = path.join(built.dir, 'portalforge-additions.ini');
  fs.writeFileSync(file, recipe.ini);
  const native_additions = { version: 1, file, sha256: hash(recipe.ini), additions, options: recipe.options };
  fs.writeFileSync(path.join(built.dir, 'portalforge-additions.json'), JSON.stringify(native_additions, null, 2));
  const runPatch = tutorial ? { ...built, native_additions } : { ...built.redirect, native_additions };
  const redirect = tutorial ? null : { level: session.archive, name: session.level?.name ?? null };
  log(
    `batch of ${additions.length} on ${session.archive}: ${recipe.bytes} bytes of ${layout} recipe, base 0x${params.base.toString(16)}, anchor ${params.anchor.name}`,
  );

  const started = new Date().toISOString();
  let record = null,
    error = null;
  try {
    record = await deps.run({
      session,
      patch: runPatch,
      archive: tutorial ? session.archive : runPatch.entry_archive,
      mode,
      redirect,
      prediction:
        prediction ||
        `${additions.length} added objects stand on a grid from ${origin.map(n => n.toFixed(1)).join(', ')}, created by the game itself.`,
      nativeInspect: (rows, opts) => inspectProbe(rows, undefined, opts),
    });
  } catch (e) {
    error = e.message;
  }
  const byOffset = new Map(session.placements.map(p => [p.offset, p]));
  const results = judgeRun(additions, record?.native_samples ?? []).map(row => ({
    ...row,
    name: byOffset.get(row.source)?.name ?? null,
    family: classifyAddition(session, byOffset.get(row.source)).family,
  }));
  const batch = {
    version: PROBE_VERSION,
    level: session.archive,
    started,
    finished: new Date().toISOString(),
    run: record?.id ?? null,
    status: record?.status ?? 'FAILED',
    error: error ?? record?.error ?? null,
    consumption: record?.consumption ?? null,
    screenshots: record?.screenshots ?? [],
    params: { base: params.base, anchor: params.anchor, snapshot: params.snapshot ?? null },
    options: recipe.options,
    bytes: recipe.bytes,
    origin,
    additions,
    results,
    whole_batch: record?.native_additions ?? null,
  };
  const out = path.join(dir, `batch-${started.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(out, JSON.stringify(batch, null, 2));
  return { ...batch, file: out };
}

// Two boots of the same batch, judged together: a source passes when both boots passed it. One report per
// family, in the format the catalogue already reads; nothing here confirms a family.
export function writeFamilyReports(batches, { dir = reportsDir } = {}) {
  if (batches.length < 2) throw Error('A family report needs two boots of the same batch.');
  const same = batches.every(b => JSON.stringify(b.additions) === JSON.stringify(batches[0].additions));
  if (!same) throw Error('These boots did not run the same batch.');
  fs.mkdirSync(dir, { recursive: true });
  const reports = [];
  for (const first of batches[0].results) {
    const rows = batches.map(b => b.results.find(r => r.id === first.id));
    const passed = rows.every(r => r?.runtime === 'passed');
    const observed = rows.some(r => r?.runtime === 'passed' || r?.runtime === 'observed');
    const report = {
      version: PROBE_VERSION,
      family: first.family,
      source: first.source,
      name: first.name,
      level: batches[0].level,
      runtime: passed ? 'passed' : observed ? 'inconclusive' : 'failed',
      observed_live: observed,
      visual: 'pending',
      gameplay: 'pending',
      runs: batches.length,
      reason: passed
        ? 'Native creation passed in every run; visual and gameplay review pending.'
        : (rows.find(r => r?.runtime !== 'passed')?.verification_error ??
          rows.find(r => r?.runtime !== 'passed')?.reason ??
          'No complete native result.'),
      batch: batches.map(b => b.run),
      updated: batches.at(-1).finished,
    };
    fs.writeFileSync(path.join(dir, first.family + '.json'), JSON.stringify(report, null, 2));
    reports.push(report);
  }
  return reports;
}
