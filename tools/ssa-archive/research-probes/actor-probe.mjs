// Learn how the running game lays out a live actor, and enumerate the placement instances it created (feature
// 006).
//
// Boots the level in direct play through the editor's own path and, once the game is playing, takes a scene
// snapshot (src/editor/scene-snapshot.mjs), which now includes the instances created at run time: the clones
// the scripts made and the native additions, found by their class pointer outside the resident section and
// paired with the record they were cloned from through their model and script. Then, for the record, it dumps
// the actors of the first active placements (+0xF4) and reports where an actor keeps its placement pointer and
// its current position, by looking for the placement's position around every pointer the actor holds. One boot;
// the game is stopped after the reads.
//
//   node research-probes/actor-probe.mjs [--level Level_000_Mining] [--learn 8]
import fs from 'node:fs';
import path from 'node:path';
import { openLevel } from '../src/editor/level-open.mjs';
import { applyEdit } from '../src/editor/session.mjs';
import { save, patch, launch } from '../src/editor/save.mjs';
import { editorDeps } from '../src/cli/commands/edit.mjs';
import { local } from '../src/experiments/run-game.mjs';
import { readNativeBytes } from '../src/editor/native-run.mjs';
import { captureSceneSnapshot, saveSnapshot, pointerWords, findTriple } from '../src/editor/scene-snapshot.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const level = arg('--level', 'Level_000_Mining');
const learnCount = Number(arg('--learn', '8'));
const log = line => console.error(new Date().toISOString().slice(11, 19) + ' ' + line);
const hex = v => '0x' + (v >>> 0).toString(16);

const s = await openLevel(level, { log });
const byOffset = new Map(s.placements.map(p => [p.offset, p]));
const emerald = s.placements.find(p => p.name === '01_loot - gem_emerald') ?? s.placements.find(p => p.model?.path);
applyEdit(s, {
  kind: 'transform',
  target: emerald.offset,
  position: [emerald.position[0], emerald.position[1] + 8, emerald.position[2]],
});
const outDir = path.join(local, 'level-check');
fs.mkdirSync(outDir, { recursive: true });
const written = save(s, { out: path.join(outDir, `redirect-${level.toLowerCase()}.decoded`) });
if (!written.written) throw new Error('save refused: ' + written.plan.failures.map(f => f.reason).join('; '));
const deps = editorDeps({});
patch(s, { deps });
if (!s.lastPatch.redirect) throw new Error('the patch carries no redirect descriptor');

const report = { level, started: new Date().toISOString(), learned: [], layout: null, created: null, error: null };
const controller = new AbortController();
let probing = false;

async function learn(snapshot) {
  const base = snapshot.base;
  for (const r of snapshot.placements.filter(r => r.state === 1 && r.actor).slice(0, learnCount)) {
    const dump = await readNativeBytes(r.actor, 0x400);
    const entry = {
      name: r.name,
      actor: hex(r.actor),
      class: hex(dump.readUInt32BE(0)),
      self_pointers: pointerWords(dump)
        .filter(w => w.value === base + r.offset)
        .map(w => hex(w.offset)),
      placement_pointers: pointerWords(dump)
        .filter(w => w.value >= base && byOffset.has(w.value - base))
        .map(w => ({ at: hex(w.offset), placement: byOffset.get(w.value - base).name })),
      inline_triple: findTriple(dump, r.current).map(hex),
      via_pointer: [],
    };
    for (const w of pointerWords(dump)) {
      if (w.value === base + r.offset) continue;
      let target;
      try {
        target = await readNativeBytes(w.value, 0x140);
      } catch {
        continue;
      }
      for (const at of findTriple(target, r.current))
        entry.via_pointer.push({ pointer_at: hex(w.offset), triple_at: hex(at) });
    }
    report.learned.push(entry);
    log(
      `${r.name.padEnd(26)} actor ${entry.actor} class ${entry.class} self ${entry.self_pointers.join(',') || '-'} others ${entry.placement_pointers.map(p => p.at + ':' + p.placement).join(' ') || '-'} via ${entry.via_pointer.map(v => v.pointer_at + '->' + v.triple_at).join(' ') || '-'}`,
    );
  }
  const agree = pick => {
    const counts = new Map();
    for (const e of report.learned) for (const v of new Set(pick(e))) counts.set(v, (counts.get(v) ?? 0) + 1);
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return best && best[1] >= Math.max(2, Math.ceil(report.learned.length * 0.75))
      ? { value: best[0], agreement: best[1] }
      : null;
  };
  report.layout = {
    self_at: agree(e => e.self_pointers),
    position_via: agree(e => e.via_pointer.map(v => v.pointer_at + '->' + v.triple_at)),
    classes: [...new Set(report.learned.map(e => e.class))],
  };
  log(`actor layout ${JSON.stringify(report.layout)}`);
}

async function probe() {
  probing = true;
  let snapshot = null;
  try {
    log('snapshot: locating the level, reading every placement, scanning MEM1 for created instances');
    snapshot = await captureSceneSnapshot(s, {
      readBytes: readNativeBytes,
      run: s.lastPatch.experiment_id,
      moment: 'first playable frame',
    });
    const created = snapshot.actors ?? [];
    report.created = created;
    const withTemplate = created.filter(a => a.template);
    const byLabel = {};
    for (const a of created) byLabel[a.label] = (byLabel[a.label] ?? 0) + 1;
    log(
      `snapshot ${JSON.stringify(snapshot.counts)} moved ${snapshot.moved}; created instances ${created.length} (${JSON.stringify(byLabel)}), ${withTemplate.length} paired with a template, ${created.filter(a => a.actor).length} with an actor`,
    );
    for (const a of created.slice(0, 40))
      log(
        `  created ${a.address} ${a.label.padEnd(8)} ${(a.template?.name ?? '?').padEnd(32)} template ${a.template?.label ?? '-'} parent ${a.parent?.name ?? '-'} at ${a.current.join(',')} h ${a.heading}${a.actor ? ' actor' : ''}`,
      );
    await learn(snapshot);
  } catch (e) {
    report.error = e.message;
    log('probe failed: ' + e.message);
  } finally {
    report.finished = new Date().toISOString();
    if (snapshot) report.snapshot_file = saveSnapshot(snapshot);
    fs.writeFileSync(path.join(outDir, `actor-probe-${Date.now()}.json`), JSON.stringify(report, null, 2));
    controller.abort();
  }
}

log('launch direct-play through the redirect; the probe runs once the game is playing');
await launch(s, {
  mode: 'direct-play',
  prediction: 'Created placement instances of ' + level + ' enumerated in MEM1 with their template and position',
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
console.log(
  JSON.stringify(
    {
      ...report,
      learned: report.learned.length,
      created: report.created?.length ?? null,
      launch: s.lastLaunch?.experiment_id,
    },
    null,
    2,
  ),
);
