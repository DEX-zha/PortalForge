// Runtime probe of placement records on a level reached through the archive redirect (feature 006).
//
// Boots the level in direct play through the editor's own path and, once the game is playing, takes a scene
// snapshot with src/editor/scene-snapshot.mjs: every record's runtime state (active, dormant, finished,
// template), its actor and where it stands against where the file stores it. The snapshot lands under
// .local/dolphin-evidence/scene-snapshots/<level>/ where the editor's "As in game" layer reads it. One Dolphin
// boot; the game is stopped as soon as the read is done. research-probes/actor-probe.mjs goes further and
// enumerates the live actors.
//
//   node research-probes/instance-probe.mjs [--level Level_000_Mining] [--names "A,B,C"]
//
// --names prints the named records in detail after the summary.
import fs from 'node:fs';
import path from 'node:path';
import { openLevel } from '../src/editor/level-open.mjs';
import { applyEdit } from '../src/editor/session.mjs';
import { save, patch, launch } from '../src/editor/save.mjs';
import { editorDeps } from '../src/cli/commands/edit.mjs';
import { local } from '../src/experiments/run-game.mjs';
import { readNativeBytes } from '../src/editor/native-run.mjs';
import { captureSceneSnapshot, saveSnapshot } from '../src/editor/scene-snapshot.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const level = arg('--level', 'Level_000_Mining');
const names = arg('--names', '')
  .split(',')
  .map(n => n.trim())
  .filter(Boolean);
const log = line => console.error(new Date().toISOString().slice(11, 19) + ' ' + line);

const s = await openLevel(level, { log });
if (!s.level.capabilities.direct_entry.available)
  throw new Error('direct entry is not offered on this level: ' + s.level.capabilities.direct_entry.why);

// The same harmless edit as the redirect proofs, so the patch and its checkpoint are reused.
const prop = s.placements.find(p => p.name === '01_loot - gem_emerald') ?? s.placements.find(p => p.model?.path);
applyEdit(s, {
  kind: 'transform',
  target: prop.offset,
  position: [prop.position[0], prop.position[1] + 8, prop.position[2]],
});
const outDir = path.join(local, 'level-check');
fs.mkdirSync(outDir, { recursive: true });
const written = save(s, { out: path.join(outDir, `redirect-${level.toLowerCase()}.decoded`) });
if (!written.written) throw new Error('save refused: ' + written.plan.failures.map(f => f.reason).join('; '));
const deps = editorDeps({});
patch(s, { deps });
if (!s.lastPatch.redirect) throw new Error('the patch carries no redirect descriptor');

const controller = new AbortController();
let probing = false;
let result = null;
async function probe() {
  probing = true;
  try {
    log('snapshot: locating the level and reading every placement');
    const snapshot = await captureSceneSnapshot(s, {
      readBytes: readNativeBytes,
      run: s.lastPatch.experiment_id,
      moment: 'first playable frame',
    });
    const file = saveSnapshot(snapshot);
    result = { file, counts: snapshot.counts, moved: snapshot.moved, base: '0x' + snapshot.base.toString(16) };
    log(`snapshot ${JSON.stringify(snapshot.counts)} moved ${snapshot.moved} base ${result.base} -> ${file}`);
    for (const r of snapshot.placements
      .filter(r => r.moved > 0.5)
      .sort((a, b) => b.moved - a.moved)
      .slice(0, 20))
      log(
        `moved ${String(r.moved).padStart(8)}  ${r.name.padEnd(32)} ${r.label} ${r.position.join(',')} -> ${r.current.join(',')}`,
      );
    for (const name of names) {
      const r = snapshot.placements.find(x => x.name === name);
      log(
        r
          ? `${name.padEnd(30)} ${r.label} state ${r.state} actor ${r.actor ? 'yes' : 'no'} at ${r.current.join(',')}`
          : `${name}: no such placement`,
      );
    }
  } catch (e) {
    result = { error: e.message };
    log('probe failed: ' + e.message);
  } finally {
    controller.abort();
  }
}

log('launch direct-play through the redirect; the probe runs once the game is playing');
await launch(s, {
  mode: 'direct-play',
  prediction: 'Placement records of ' + level + ' read in MEM1 at the first playable frame',
  deps: {
    ...deps,
    run: args =>
      deps.run({
        ...args,
        signal: controller.signal,
        onProgress: progress => {
          args.onProgress?.(progress);
          if (progress.phase === 'playing' && !probing) probe();
        },
      }),
  },
  wait: true,
});
console.log(JSON.stringify({ level, ...result, launch: s.lastLaunch?.experiment_id ?? null }, null, 2));
