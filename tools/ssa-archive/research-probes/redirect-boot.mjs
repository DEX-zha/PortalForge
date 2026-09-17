// Screening and proof runs for the archive redirect (feature 006, finding level.entry.archive-redirect).
//
// Opens a level by name through the editor's own path, raises one static prop by a visible distance, saves,
// patches (which builds the redirect descriptor) and launches a direct mode through the editor's launcher, so
// the run leaves exactly the evidence an editor launch leaves: the record under
// .local/dolphin-evidence/editor-runs/<id>.json and its captures. Nothing here bypasses a refusal.
//
//   node research-probes/redirect-boot.mjs [--level Level_000_Mining] [--mode direct-test|direct-play] [--raise 8]
//                                           [--prop <exact placement name>]
//
// One Dolphin boot per invocation. Run it twice for the two-boot rule; the rebuilt archive is deterministic, so
// the second run's patch is byte-identical to the first's (the script prints the digest to check).
import fs from 'node:fs';
import path from 'node:path';
import { openLevel } from '../src/editor/level-open.mjs';
import { applyEdit } from '../src/editor/session.mjs';
import { save, patch, launch } from '../src/editor/save.mjs';
import { editorDeps } from '../src/cli/commands/edit.mjs';
import { local } from '../src/experiments/run-game.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const level = arg('--level', 'Level_000_Mining');
const mode = arg('--mode', 'direct-test');
const raise = Number(arg('--raise', '8'));
const wanted = arg('--prop', null);
const log = line => console.error(new Date().toISOString().slice(11, 19) + ' ' + line);

const s = await openLevel(level, { log });
log(
  `opened ${s.archive}: ${s.placements.length} placements, voice pack ${s.level.companion?.present ? 'present' : 'ABSENT'}`,
);
if (!s.level.capabilities.direct_entry.available)
  throw new Error('direct entry is not offered on this level: ' + s.level.capabilities.direct_entry.why);

// The prop to move: the one named with --prop, else a static prop with a model chosen deterministically (the
// first by name among the largest layer of script-less props), so repeated runs edit the same record.
const candidates = s.placements.filter(p => p.model?.path && !p.behavior && p.layers.length);
const byLayer = new Map();
for (const p of candidates) for (const l of p.layers) byLayer.set(l, (byLayer.get(l) ?? 0) + 1);
const layer = [...byLayer.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
const props = wanted
  ? wanted.split(',').map(name => {
      const p = s.placements.find(x => x.name === name.trim());
      if (!p) throw new Error(`no placement named ${name.trim()}`);
      return p;
    })
  : [
      candidates
        .filter(p => p.layers.includes(layer))
        .sort((a, b) => a.name.localeCompare(b.name) || a.offset - b.offset)[0],
    ];
if (!props[0]) throw new Error('no static prop with a model to move');
const edits = [];
for (const prop of props) {
  const before = [...prop.position];
  applyEdit(s, { kind: 'transform', target: prop.offset, position: [before[0], before[1] + raise, before[2]] });
  edits.push({ name: prop.name, offset: prop.offset, before });
  log(
    `edit: ${prop.name} (layers ${prop.layers.join('|')}, model ${prop.model.path.replace(/^.*\//, '')}${prop.behavior ? ', script ' + prop.behavior.path.replace(/^.*\//, '') : ''}) y ${before[1]} -> ${before[1] + raise}`,
  );
}
const prop = props[0];

const outDir = path.join(local, 'level-check');
fs.mkdirSync(outDir, { recursive: true });
const written = save(s, {
  out: path.join(outDir, `redirect-${level.toLowerCase()}-${prop.name.replace(/[^A-Za-z0-9]+/g, '_')}.decoded`),
});
if (!written.written) throw new Error('save refused: ' + written.plan.failures.map(f => f.reason).join('; '));
log(`saved ${written.written} (${written.plan.changes.length} changed words)`);

const deps = editorDeps({});
patch(s, { deps });
const p = s.lastPatch;
log(`patch ${p.dir}: rebuilt ${p.rebuilt_sha256?.slice(0, 16)}; redirect ${p.redirect ? p.redirect.dir : 'NONE'}`);
if (!p.redirect) throw new Error('the patch carries no redirect descriptor');
for (const r of p.redirect.replacements) log(`  redirect serves ${r.disc_path} <- ${r.file} (${r.size} bytes)`);

const moved = edits.map(e => e.name).join(' and ');
const prediction = `The game loads ${level} instead of the tutorial after the checkpoint transition; ${moved} ${edits.length > 1 ? 'stand' : 'stands'} ${Math.abs(raise)} units ${raise >= 0 ? 'above' : 'below'} the original spot.`;
log(`launch ${mode}: ${prediction}`);
await launch(s, { mode, prediction, deps, wait: true });
const { promise, controller, ...result } = s.lastLaunch;
console.log(JSON.stringify({ level, mode, edits, raise, ...result }, null, 2));
