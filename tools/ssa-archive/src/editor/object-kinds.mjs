// What an object is, whatever level it sits in, and where the Project tab files it (feature 007, phase P).
//
// A level says where each of its records comes from: the library layer it was compiled from
// (`Enemy_Elemental_Swarmer.lvl`), and the directory of its behaviour script in the game's own content tree
// (`Levels/_Enemies/Elemental_Swarmer/scripts`, `Levels/Includes/GameElement_PushBlock`, `Levels/Level_000/Scripts`).
// Folders and kinds are read from that, never guessed from a display name, so two objects that happen to share a
// name are never merged and an object always falls in exactly one folder.
//
// Three depths of identity, so that nothing stored for one level can be read as another's:
//   record  (level archive, file offset)       unique on the disc; the only thing an addition's source may name
//   family  (archive, model, script, scale)    per level; the key of a verification report
//   kind    (model path, script path)          across levels; what this module computes
import { sha256 } from '../util/hash.mjs';

const INVISIBLE_MODEL = /inviso\.mdl$/i; // the engine's placeholders for records with nothing to draw
const LIBRARY = /\.lvl$/i;

const fileOf = file => (file ? String(file).split(/[/\\]/).at(-1) : null);
// Keep directories in the key: levels often contain distinct scripts with the same file name. The drive and
// install prefix are machine-specific, so start at the game's Content root when one is present.
const contentPath = file => {
  if (!file) return null;
  const normalized = String(file).replace(/\\/g, '/').toLowerCase();
  const root = normalized.indexOf('/content/');
  return root < 0 ? normalized : normalized.slice(root + '/content/'.length);
};

// The directories of a content path, from the game's Content root down, without the file name.
export function contentDirs(file) {
  if (!file) return [];
  const parts = String(file).replace(/\\/g, '/').split('/');
  const root = parts.findIndex(part => part.toLowerCase() === 'content');
  return parts.slice(root + 1, -1);
}

export const libraryOf = placement => placement.layers?.find(layer => LIBRARY.test(layer)) ?? null;
const ownLayerOf = placement => placement.layers?.find(layer => !LIBRARY.test(layer)) ?? null;

export const drawsSomething = placement => !!placement.model?.path && !INVISIBLE_MODEL.test(placement.model.path);

// `Barrel(12)` and `Barrel (3)` are instances of `Barrel`.
export const bareName = name => (name ?? '').replace(/\s*\(\d+\)\s*$/, '').trim();

// The kind of a record: its model path and its script path. A record with neither (a camera mark, a position) is
// its own kind under its bare name, so that such records are never merged into one.
export function kindOf(placement) {
  const model = fileOf(placement.model?.path);
  const script = fileOf(placement.behavior?.path);
  const name = bareName(placement.name);
  const identity =
    model || script
      ? [contentPath(placement.model?.path), contentPath(placement.behavior?.path)]
      : ['name', name.toLowerCase()];
  return { key: sha256(JSON.stringify(identity)).slice(0, 16), model, script, name };
}

const strip = (text, ...patterns) => patterns.reduce((out, pattern) => out.replace(pattern, ''), text);

// Where the Project tab files a record: [root, child]. The first rule that matches decides; the last two always
// match, so every record has exactly one folder.
export function folderOf(placement) {
  const library = libraryOf(placement)?.replace(LIBRARY, '') ?? null;
  const dirs = contentDirs(placement.behavior?.path);
  const under = (parent, child) => dirs[0] === parent && dirs[1] === child && dirs[2];
  const enemy = under('Levels', '_Enemies');
  const include = under('Levels', 'Includes');
  const origin = library ?? include ?? null;

  if (library && /^(enem(y|ies)|macros_enemy)/i.test(library))
    return ['Enemies', strip(library, /^Enem(y|ies)_?/i, /_common$/i) || 'Shared'];
  if (enemy) return ['Enemies', /^(scripts|test_levels)$/i.test(enemy) ? 'Shared' : enemy];
  if (origin && /sounds?$/i.test(origin)) return ['Logic', 'Sounds'];
  if (origin && /^GameElement_/i.test(origin)) return ['Game elements', strip(origin, /^GameElement_/i)];
  if (origin && /^(treasure|placedloot|loot)/i.test(origin)) return ['Loot and treasure', origin];
  if (origin && /destruct/i.test(origin)) return ['Destructibles', origin];
  // A library named after a level (`Level_027_plants`) is that level's own content, compiled apart.
  if (origin && /^level_\d+/i.test(origin)) return ['This level', origin];
  if (origin) return ['Shared libraries', origin];
  return [drawsSomething(placement) ? 'This level' : 'Logic', ownLayerOf(placement) ?? 'Unsorted'];
}
