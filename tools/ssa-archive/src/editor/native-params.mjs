// What the native-addition recipe needs to know about one level: where its resident section sits in memory,
// and which placement says "the level is ready".
//
// On the tutorial both are constants, validated by the boots of feature 005. On every other level they are read
// from the level's latest scene snapshot (scene-snapshot.mjs), which measured the base in the running game and
// saw which placements were active with an actor. Nothing is guessed: a level without a snapshot has no
// parameters, and the recipe refuses to compile for it. A wrong base is harmless by construction, because the
// compiled code checks the class pointer, the model and the script of every source before it calls the factory.
import fs from 'node:fs';
import { NATIVE_BASE, TUTORIAL_ANCHOR } from './native-patch.mjs';
import { latestSnapshot, latestSnapshotFile } from './scene-snapshot.mjs';
import { isTutorial } from './levels.mjs';

const INVISIBLE_MODEL = /[/\\]inviso\.mdl$/i;
const STATE_ACTIVE = 1;
const STILL = 0.05; // an anchor that wanders is a poor landmark; this is well under any real movement

const tutorialParams = () => ({
  available: true,
  level: 'tutorial',
  options: {}, // the compiler's defaults are the tutorial's, which keeps its boot-proven output unchanged
  base: NATIVE_BASE,
  anchor: { address: TUTORIAL_ANCHOR, offset: TUTORIAL_ANCHOR - NATIVE_BASE, name: 'Sunflower source' },
  evidence: 'level.prop.native-addition (CONFIRMED)',
});

// The placement that will stand for "the level is ready": active with an actor in the snapshot. A still, visible,
// script-less prop comes first, because that is what the tutorial's anchor is; any active placement will do
// otherwise. The lowest file offset breaks ties, so the same snapshot always gives the same anchor.
export function chooseAnchor(session, snapshot) {
  const byOffset = new Map(session.placements.map(p => [p.offset, p]));
  const active = (snapshot.placements ?? [])
    .filter(row => row.state === STATE_ACTIVE && row.actor && byOffset.has(row.offset))
    .map(row => ({ row, placement: byOffset.get(row.offset) }));
  const rank = ({ row, placement }) => {
    const visible = placement.model?.path && !INVISIBLE_MODEL.test(placement.model.path);
    const still = (row.moved ?? 0) <= STILL;
    return (visible ? 0 : 4) + (placement.behavior ? 2 : 0) + (still ? 0 : 1);
  };
  active.sort((a, b) => rank(a) - rank(b) || a.row.offset - b.row.offset);
  const best = active[0];
  return best ? { offset: best.row.offset, name: best.placement.name, rank: rank(best) } : null;
}

// The catalogue asks once per placement, and a snapshot is a few hundred kilobytes of JSON: the answer is kept
// for as long as the newest snapshot file and the opened level stay the same.
const remembered = new Map();
const modified = file => {
  try {
    return file ? fs.statSync(file).mtimeMs : null;
  } catch {
    return null;
  }
};

// `dir` is where the snapshots are kept; a session served with its own snapshot folder names it in
// `snapshots_dir`, so that the catalogue and the patch read the folder the snapshot route writes to.
export function nativeParamsFor(session, { dir = session.snapshots_dir, snapshot } = {}) {
  if (isTutorial(session.archive)) return tutorialParams();
  if (snapshot) return paramsFrom(session, snapshot);
  const file = latestSnapshotFile(session.archive, dir ? { dir } : undefined);
  const key = [session.archive, session.original_sha256, session.placements.length, file, modified(file)].join('|');
  if (!remembered.has(key)) {
    remembered.clear();
    remembered.set(key, paramsFrom(session, file ? latestSnapshot(session.archive, dir ? { dir } : undefined) : null));
  }
  return remembered.get(key);
}

function paramsFrom(session, snapshot) {
  if (!snapshot)
    return { available: false, reason: 'Take a scene snapshot of this level first: it measures where the level sits.' };
  if (snapshot.original_sha256 && session.original_sha256 && snapshot.original_sha256 !== session.original_sha256)
    return { available: false, reason: 'The scene snapshot was taken on another version of this level.' };
  if (!Number.isInteger(snapshot.base))
    return { available: false, reason: 'The scene snapshot did not locate the level in memory.' };
  const anchor = chooseAnchor(session, snapshot);
  if (!anchor)
    return { available: false, reason: 'The scene snapshot shows no placement active with an actor to anchor on.' };
  const address = snapshot.base + anchor.offset;
  return {
    available: true,
    level: session.archive,
    options: { base: snapshot.base, anchor: address, context: 'activation' },
    base: snapshot.base,
    anchor: { address, ...anchor },
    snapshot: { taken: snapshot.taken ?? null, run: snapshot.run ?? null, moment: snapshot.moment ?? null },
    evidence: 'level.runtime.scene-snapshot (LIKELY)',
  };
}
