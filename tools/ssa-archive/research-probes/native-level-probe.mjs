// Native additions on a level other than the tutorial (feature 007, experiments A1 and A2), and the batch
// campaign that replaces per-object hand checks (phase V).
//
// Opens a level by name through the editor's own path, places a batch of sources on a grid, and boots it once
// through the redirect with the additions compiled for that level: its resident base and its readiness anchor
// come from the level's latest scene snapshot. Every addition is judged from memory at each capture and at the
// end. Nothing here makes a source editable; a second identical boot and a look at the captures come first.
//
//   node research-probes/native-level-probe.mjs --level Level_000_Mining --origin 76,10.9,-47
//        [--sources "Lantern_01,gem_emerald(2)"]   exact placement names, else --auto
//        [--auto 8]                                one source per family, nearest to the origin first
//        [--layout slot|table]                     slot = the proven 144-byte layout (18 at most), table = 40 bytes
//        [--spacing 2.5] [--columns 8] [--mode direct-test|direct-play]
//        [--dry]                                   plan and compile only: no save, no patch, no boot
//        [--report a.json,b.json]                  judge two finished boots and write the family reports
//
// One Dolphin boot per invocation; run it twice for the two-boot rule, then pass both result files to --report.
import fs from 'node:fs';
import { openLevel } from '../src/editor/level-open.mjs';
import { editorDeps } from '../src/cli/commands/edit.mjs';
import { nativeParamsFor } from '../src/editor/native-params.mjs';
import { compileNativeProbe, nativeCapacity } from '../src/editor/native-patch.mjs';
import {
  batchAdditions,
  campaignSources,
  runLevelBatch,
  writeFamilyReports,
} from '../src/editor/addition-campaign.mjs';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const flag = name => process.argv.includes(name);
const log = line => console.error(new Date().toISOString().slice(11, 19) + ' ' + line);

if (arg('--report')) {
  const batches = arg('--report')
    .split(',')
    .map(file => JSON.parse(fs.readFileSync(file.trim(), 'utf8')));
  const reports = writeFamilyReports(batches);
  for (const r of reports) console.log(r.runtime.padEnd(13), r.name, '-', r.reason);
  process.exit(0);
}

const level = arg('--level', 'Level_000_Mining');
const origin = (arg('--origin') ?? '').split(',').map(Number);
if (origin.length !== 3 || origin.some(n => !Number.isFinite(n))) throw new Error('give --origin x,y,z');
const layout = arg('--layout', 'slot');
const spacing = Number(arg('--spacing', '2.5'));
const columns = Number(arg('--columns', '8'));

const s = await openLevel(level, { log });
const params = nativeParamsFor(s);
if (!params.available) throw new Error(params.reason);
log(
  `${s.archive}: base 0x${params.base.toString(16)}, anchor ${params.anchor.name} at 0x${params.anchor.address.toString(16)}, snapshot ${params.snapshot?.taken ?? 'n/a'}`,
);
const options = { ...params.options, layout };
log(`capacity with the ${layout} layout: ${nativeCapacity(options, { scripted: true })} additions`);

const named = arg('--sources');
const sources = named
  ? named.split(',').map(name => {
      const p = s.placements.find(x => x.name === name.trim());
      if (!p) throw new Error(`no placement named ${name.trim()}`);
      return p.offset;
    })
  : campaignSources(s, { origin, count: Number(arg('--auto', '8')) });

const additions = batchAdditions(s, sources, { origin, spacing, columns });
for (const a of additions) {
  const p = s.placements.find(x => x.offset === a.source);
  log(
    `  ${String(a.id).padStart(3)} ${p.name.padEnd(34)} ${p.model.path.replace(/^.*\//, '').padEnd(30)} ${(p.behavior?.path ?? '-').replace(/^.*\//, '').padEnd(26)} -> ${a.position.map(n => n.toFixed(1)).join(', ')}`,
  );
}
const recipe = compileNativeProbe(additions, { ...options, limit: additions.length });
log(`recipe: ${recipe.bytes} bytes, hook ${recipe.hooks.map(h => '0x' + h.address.toString(16)).join(', ')}`);
if (flag('--dry')) process.exit(0);

const batch = await runLevelBatch(s, {
  sources,
  origin,
  spacing,
  columns,
  layout,
  mode: arg('--mode'),
  deps: editorDeps({}),
  log,
});
for (const r of batch.results)
  log(`  ${r.runtime.padEnd(9)} ${String(r.name).padEnd(34)} ${r.verification_error ?? r.reason}`);
console.log(
  JSON.stringify(
    { file: batch.file, run: batch.run, status: batch.status, error: batch.error, results: batch.results },
    null,
    2,
  ),
);
