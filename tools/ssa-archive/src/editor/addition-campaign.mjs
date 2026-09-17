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
// A level that was never measured runs the same batch through the live routine (native-live.mjs): the run
// measures the level when it reaches it, and the batch is laid out there, next to the placement the level was
// anchored on, which is active and therefore near the player.
//
// A batch confirms nothing by itself. Like any launch it files one report per family, which the catalogue shows
// next to Add as "verified in game"; findings stay a human decision on two identical boots.
import fs from 'node:fs';
import path from 'node:path';
import { classifyAddition, groupCandidates, PROBE_VERSION } from './addition-compatibility.mjs';
import { additionSource } from './native-additions.mjs';
import { compileNativeProbe, nativeCapacity } from './native-patch.mjs';
import { nativeParamsFor } from './native-params.mjs';
import { inspectAdditions } from './native-run.mjs';
import { judgeRun, fileLaunchReports, reportsDir } from './addition-reports.mjs';
import { liveArrival } from './native-live.mjs';
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
export function campaignSources(session, { origin, count, exclude = [], visibleOnly = false } = {}) {
  const distance = p => Math.hypot(p.position[0] - origin[0], p.position[2] - origin[2]);
  const byOffset = new Map(session.placements.map(p => [p.offset, p]));
  const skip = new Set(exclude);
  return (
    groupCandidates(session)
      .filter(family => !skip.has(family.family))
      // Objects with nothing to draw include a level's singletons (its master script, its cutscene directors):
      // a capacity experiment leaves them out, a level campaign takes them with a savestate at hand.
      .filter(family => !visibleOnly || (family.model && !/inviso\.mdl$/i.test(family.model)))
      .map(family => {
        const members = family.members.map(o => byOffset.get(o)).sort((a, b) => distance(a) - distance(b));
        return { family: family.family, placement: members[0], distance: distance(members[0]) };
      })
      .sort((a, b) => a.distance - b.distance || a.placement.offset - b.placement.offset)
      .slice(0, count)
      .map(row => row.placement.offset)
  );
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
      model: placement.model?.offset ?? null,
      script: placement.behavior?.offset ?? null,
      // Anything without its own confirmed recipe is created from the activation manager (native-patch.mjs).
      ...(additionSource(session, placement.offset).evidence === 'confirmed' ? {} : { experimental: true }),
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

export { judgeRun };

// Where a batch stands when nobody said: beside the placement the level is anchored on. That placement is active
// with an actor when the level starts, so the player is within its activation range and the batch is too.
function besideAnchor(session, anchor) {
  const placement = session.placements.find(p => p.offset === anchor.offset);
  if (!placement) throw Error('Give the batch an origin: the anchor of this level is not one of its placements.');
  return [placement.position[0] + 2, placement.position[1], placement.position[2] + 2];
}

export async function runLevelBatch(
  session,
  {
    sources = null,
    auto = 8,
    visibleOnly = false,
    origin = null,
    spacing,
    columns,
    layout = 'slot',
    mode = null,
    deps,
    prediction = '',
    log = () => {},
    reports = reportsDir,
    outDir = campaignsDir,
    inspect = null,
  } = {},
) {
  if (session.dirty || session.edits.length || hash(session.buffer) !== session.original_sha256)
    throw Error('A batch runs on the unedited level: reset the scene before testing sources.');
  if (session.additions?.length) throw Error('A batch runs without scene additions: remove them first.');

  // The batch, once it is known where it stands: the named sources, or one source per family around that spot.
  const plan = (level, at = origin ?? besideAnchor(session, level.anchor)) => ({
    origin: at,
    additions: batchAdditions(session, sources ?? campaignSources(session, { origin: at, count: auto, visibleOnly }), {
      origin: at,
      spacing,
      columns,
    }),
  });

  const known = nativeParamsFor(session);
  const live = layout === 'live' || !known.available;
  let level = live ? null : known;
  let batch = live ? null : plan(known);
  let recipe;
  if (live) {
    recipe = compileNativeProbe([], { layout: 'live', capacity: nativeCapacity({ layout: 'live' }) });
  } else {
    const options = { ...known.options, layout, limit: batch.additions.length };
    const capacity = nativeCapacity(options, { scripted: true });
    if (batch.additions.length > capacity)
      throw Error(
        `This layout holds ${capacity} additions in one patch; the batch asks for ${batch.additions.length}.`,
      );
    recipe = compileNativeProbe(batch.additions, options);
  }

  const tutorial = isTutorial(session.archive);
  mode ??= tutorial ? 'test' : 'direct-test';
  const slug = levelSlug(session.archive);
  const dir = path.join(outDir, slug);
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
  const native_additions = {
    version: 1,
    file,
    sha256: hash(recipe.ini),
    additions: batch?.additions ?? [],
    options: recipe.options,
    ...(live ? { live: true } : {}),
  };
  fs.writeFileSync(path.join(built.dir, 'portalforge-additions.json'), JSON.stringify(native_additions, null, 2));
  const runPatch = tutorial ? { ...built, native_additions } : { ...built.redirect, native_additions };
  const redirect = tutorial ? null : { level: session.archive, name: session.level?.name ?? null };
  log(
    live
      ? `live batch on ${session.archive}: ${recipe.bytes} bytes of routine, the level is measured at arrival`
      : `batch of ${batch.additions.length} on ${session.archive}: ${recipe.bytes} bytes of ${layout} recipe, base 0x${known.base.toString(16)}, anchor ${known.anchor.name}`,
  );

  // A live batch is laid out by the run itself, once it has measured the level.
  const arrival = live
    ? (deps.liveArrival ?? liveArrival)(
        session,
        ({ params }) => {
          level = params;
          batch = plan(params);
          log(
            `measured: base 0x${params.base.toString(16)}, anchor ${params.anchor.name}; ${batch.additions.length} additions from ${batch.origin.map(n => n.toFixed(1)).join(', ')}`,
          );
          return batch.additions;
        },
        session.snapshots_dir ? { snapshotDir: session.snapshots_dir } : {},
      )
    : null;

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
      prediction: prediction || 'A batch of added objects stands on a grid near the start, created by the game itself.',
      nativeInspect: (rows, opts) => inspectAdditions(rows, undefined, opts),
      ...(arrival ? { nativeArrival: arrival } : {}),
      // A probe's own reading next to the rows: what a spawner left behind, for one.
      ...(inspect
        ? { inspect: capture => (batch ? inspect({ params: level, additions: batch.additions, capture }) : []) }
        : {}),
    });
  } catch (e) {
    error = e.message;
  }
  const additions = batch?.additions ?? [];
  const byOffset = new Map(session.placements.map(p => [p.offset, p]));
  const results = judgeRun(additions, record?.native_samples ?? []).map(row => ({
    ...row,
    name: byOffset.get(row.source)?.name ?? null,
    family: classifyAddition(session, byOffset.get(row.source)).family,
  }));
  const outcome = {
    version: PROBE_VERSION,
    level: session.archive,
    started,
    finished: new Date().toISOString(),
    run: record?.id ?? null,
    status: record?.status ?? 'FAILED',
    error: error ?? record?.error ?? record?.native_arrival?.error ?? null,
    consumption: record?.consumption ?? null,
    screenshots: record?.screenshots ?? [],
    live,
    params: level ? { base: level.base, anchor: level.anchor, snapshot: level.snapshot ?? null } : null,
    arrival: record?.native_arrival ?? null,
    options: recipe.options,
    bytes: recipe.bytes,
    recipe_sha256: hash(recipe.ini),
    origin: batch?.origin ?? null,
    additions,
    results,
    whole_batch: record?.native_additions ?? null,
    inspections: record?.inspections ?? null,
  };
  // The cards of these families show what this boot saw, like after any launch.
  if (record?.native_samples?.length) fileLaunchReports(session, results, { run: record.id, dir: reports });
  const out = path.join(dir, `batch-${started.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(out, JSON.stringify(outcome, null, 2));
  return { ...outcome, file: out };
}
