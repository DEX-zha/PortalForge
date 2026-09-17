// Native additions on any level, one batch per boot (feature 007): the experiments behind
// specs/007-unlimited-additions/validation.md, and the campaign that replaces per-object hand checks.
//
// Opens a level by name through the editor's own path, lays a batch of sources on a grid and boots it once
// through the redirect. Every addition is read back from memory at each capture of the level and at the end, and
// the verdicts are filed per family like after any launch. Nothing here confirms a source: a second identical
// boot and a look at the screen come first.
//
// A level that has a scene snapshot gets its table compiled in. A level that was never measured, or --live, gets
// the live routine: the run measures the level when it reaches it, lays the batch out there and writes it into
// the running game.
//
//   node research-probes/native-level-probe.mjs --level Level_000_Mining
//        [--sources "Lantern_01,gem_emerald(2)"]   exact placement names, else --auto
//        [--auto 8] [--visible]                    one source per family, nearest to the origin first; --visible
//                                                  leaves out objects with nothing to draw (level singletons)
//        [--origin 76,10.9,-47]                    where the grid starts; by default beside the level's anchor
//        [--layout slot|table|live] [--live]       slot = 144-byte slots (18 at most), table = 40-byte rows (59),
//                                                  live = the same rows, written into the running game
//        [--spacing 2.5] [--columns 8] [--mode direct-test|direct-play]
//        [--scan 12]                               list the placement instances the game created within that
//                                                  distance of the batch (what a spawner left behind)
//        [--dry]                                   plan and compile only: no patch, no boot
//
// One Dolphin boot per invocation; run it twice for the two-boot rule.
import { openLevel } from '../src/editor/level-open.mjs';
import { editorDeps } from '../src/cli/commands/edit.mjs';
import { nativeParamsFor } from '../src/editor/native-params.mjs';
import { compileNativeProbe, nativeCapacity } from '../src/editor/native-patch.mjs';
import { readNativeBytes } from '../src/editor/native-run.mjs';
import { scanCreatedInstances } from '../src/editor/scene-snapshot.mjs';
import { batchAdditions, campaignSources, runLevelBatch } from '../src/editor/addition-campaign.mjs';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const flag = name => process.argv.includes(name);
const log = line => console.error(new Date().toISOString().slice(11, 19) + ' ' + line);
const basename = file => (file ?? '-').replace(/^.*[/\\]/, '');

const level = arg('--level', 'Level_000_Mining');
const origin = arg('--origin') ? arg('--origin').split(',').map(Number) : null;
if (origin && (origin.length !== 3 || origin.some(n => !Number.isFinite(n)))) throw new Error('--origin takes x,y,z');
const spacing = Number(arg('--spacing', '2.5'));
const columns = Number(arg('--columns', '8'));
const auto = Number(arg('--auto', '8'));
const visibleOnly = flag('--visible');

const s = await openLevel(level, { log });
const named = arg('--sources');
const sources = named
  ? named.split(',').map(name => {
      const p = s.placements.find(x => x.name === name.trim());
      if (!p) throw new Error(`no placement named ${name.trim()}`);
      return p.offset;
    })
  : null;

const known = nativeParamsFor(s);
const layout = flag('--live') || !known.available ? 'live' : arg('--layout', 'slot');
if (layout === 'live') {
  log(`${s.archive}: ${known.available ? 'measured, but --live was asked' : 'never measured'}; the run measures it`);
  log(`the live routine holds ${nativeCapacity({ layout })} additions`);
} else {
  log(
    `${s.archive}: base 0x${known.base.toString(16)}, anchor ${known.anchor.name} at 0x${known.anchor.address.toString(16)}, snapshot ${known.snapshot?.taken ?? 'n/a'}`,
  );
  log(`capacity with the ${layout} layout: ${nativeCapacity({ ...known.options, layout }, { scripted: true })}`);
}

const describe = additions => {
  for (const a of additions) {
    const p = s.placements.find(x => x.offset === a.source);
    log(
      `  ${String(a.id).padStart(3)} ${p.name.padEnd(34)} ${basename(p.model?.path).padEnd(30)} ${basename(p.behavior?.path).padEnd(26)} -> ${a.position.map(n => n.toFixed(1)).join(', ')}`,
    );
  }
};
// What can be shown before the boot: the whole batch when the origin is given, nothing but the intent otherwise.
if (origin) {
  const planned = batchAdditions(s, sources ?? campaignSources(s, { origin, count: auto, visibleOnly }), {
    origin,
    spacing,
    columns,
  });
  describe(planned);
  const recipe =
    layout === 'live'
      ? compileNativeProbe([], { layout, capacity: nativeCapacity({ layout }) })
      : compileNativeProbe(planned, { ...known.options, layout, limit: planned.length });
  log(`recipe: ${recipe.bytes} bytes, hook ${recipe.hooks.map(h => '0x' + h.address.toString(16)).join(', ')}`);
} else log('the batch is laid out beside the level anchor, known once the level has been measured');
if (flag('--dry')) process.exit(0);

// Instances the game created at run time near the batch: a spawner that ran leaves its enemy here. The scan
// reads all of MEM1 through the bridge, so it runs twice only: once the spawners have had time to act, and at
// the end.
const radius = Number(arg('--scan', '0'));
const scan = async ({ params, additions, capture }) => {
  if (capture && !/arrived-2/.test(capture)) return [];
  const created = await scanCreatedInstances(s, params.base, readNativeBytes);
  const centre = additions.reduce((sum, a) => sum.map((n, i) => n + a.position[i] / additions.length), [0, 0, 0]);
  const reach = radius + additions.length * spacing;
  return created
    .filter(c => Math.hypot(c.current[0] - centre[0], c.current[2] - centre[2]) <= reach)
    .map(c => ({
      address: c.address,
      state: c.label,
      actor: c.actor,
      template: c.template?.name ?? null,
      parent: c.parent?.name ?? null,
      model: c.model,
      position: c.current.map(n => Math.round(n * 10) / 10),
    }));
};

const batch = await runLevelBatch(s, {
  sources,
  auto,
  visibleOnly,
  origin,
  spacing,
  columns,
  layout,
  mode: arg('--mode'),
  deps: editorDeps({}),
  log,
  ...(radius > 0 ? { inspect: scan } : {}),
});
if (batch.live && batch.additions.length) describe(batch.additions);
for (const r of batch.results)
  log(`  ${r.runtime.padEnd(9)} ${String(r.name).padEnd(34)} ${r.verification_error ?? r.reason}`);
for (const reading of batch.inspections ?? []) {
  log(
    `created near the batch at ${reading.capture ? basename(reading.capture) : 'the end'}: ${reading.error ?? reading.result.length}`,
  );
  for (const c of reading.result ?? [])
    log(
      `    ${String(c.template ?? c.model ?? '?').padEnd(34)} ${c.state.padEnd(9)} actor ${c.actor ? 'yes' : 'no '} at ${c.position.join(', ')}`,
    );
}
console.log(
  JSON.stringify(
    {
      file: batch.file,
      run: batch.run,
      status: batch.status,
      error: batch.error,
      live: batch.live,
      arrival: batch.arrival,
      results: batch.results,
    },
    null,
    2,
  ),
);
