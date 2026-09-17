import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NATIVE_LIMIT, compileNativePatch } from './native-patch.mjs';
const recipes = JSON.parse(fs.readFileSync(new URL('./native-recipes.json', import.meta.url), 'utf8'));
const basename = s =>
  String(s ?? '')
    .split(/[/\\]/)
    .at(-1)
    .toLowerCase();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const ADDITION_FINDING = 'level.prop.native-addition';
const fail = (error, reason) => {
  throw Object.assign(new Error(`${error}: ${reason}`), { error });
};
export const additionsDigest = rows =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(rows ?? []))
    .digest('hex');
export function additionConfirmed(id = ADDITION_FINDING) {
  try {
    const f = JSON.parse(fs.readFileSync(path.join(root, 'docs/findings/records', id + '.json')));
    return f.confidence === 'CONFIRMED' && f.editable === true;
  } catch {
    return false;
  }
}
export function additionSource(s, offset) {
  const p = s.placements.find(p => p.offset === offset);
  const recipe = recipes.find(
    r =>
      r.source === offset &&
      basename(p?.model?.path) === r.model.toLowerCase() &&
      (r.script
        ? p?.behavior?.offset === r.script.offset && basename(p.behavior.path) === r.script.name.toLowerCase()
        : !p?.behavior),
  );
  const reason = !additionConfirmed()
    ? 'Native additions are still being validated.'
    : !s.has_runtime_map || s.archive?.toLowerCase() !== 'level/level_027_tutorial.bld'
      ? 'Native additions currently support the tutorial with its runtime map.'
      : !recipe || !additionConfirmed(recipe.finding)
        ? 'This object has not been validated for native addition yet.'
        : p.scale !== 100
          ? 'The source must keep its original 100% scale for native addition.'
          : null;
  return { placement: p, recipe, available: !reason, reason };
}
function validateRows(s, rows) {
  if (!Array.isArray(rows) || rows.length > NATIVE_LIMIT)
    fail('BAD_ADDITIONS', `At most ${NATIVE_LIMIT} native additions are supported.`);
  for (const a of rows) {
    if (!a || typeof a !== 'object') fail('BAD_ADDITIONS', 'Each addition must contain a source and a transform.');
    const source = additionSource(s, a.source);
    if (!source.available) fail('ADDITION_SOURCE_UNAVAILABLE', source.reason);
    if (a.model !== source.placement.model.offset)
      fail('ADDITION_SOURCE_CHANGED', 'An addition source changed its model. Undo that change before exporting.');
    if ((a.script ?? null) !== (source.recipe.script?.offset ?? null))
      fail('ADDITION_SOURCE_CHANGED', 'An addition script does not match its confirmed source.');
  }
  if (rows.length) {
    try {
      compileNativePatch(rows);
    } catch (e) {
      fail('BAD_ADDITIONS', e.message);
    }
  }
}
export function refreshAdditions(s) {
  s.placements = s.placements.filter(p => !p.native_addition);
  for (const a of s.additions ?? []) {
    const source = s.placements.find(p => p.offset === a.source);
    if (!source) fail('ADDITION_SOURCE_MISSING', 'The source of a native addition is missing.');
    const p = structuredClone(source);
    p.offset = a.id;
    p.span = 0;
    p.name = `${source.name} (Copy ${-a.id})`;
    p.position = [...a.position];
    p.rotation = { heading: a.heading };
    p.scale = a.scale;
    p.native_addition = { id: a.id, source: a.source };
    p.shared_state = null;
    p.evidence = { ...p.evidence, layout: `${additionSource(s, a.source).recipe.finding} (CONFIRMED)` };
    s.placements.push(p);
  }
}
export function applyAddition(s, intent) {
  if (s.locked || s.lastLaunch?.running) fail('SESSION_LOCKED', 'Stop this editor’s Dolphin before adding an object.');
  if (Object.keys(intent).some(k => !['kind', 'source', 'position'].includes(k)))
    fail('BAD_ADDITION', 'An addition takes a source and a position.');
  const source = additionSource(s, intent.source);
  if (!source.available) fail('ADDITION_SOURCE_UNAVAILABLE', source.reason);
  if ((s.additions?.length ?? 0) >= NATIVE_LIMIT)
    fail('ADDITION_LIMIT', `This patch supports at most ${NATIVE_LIMIT} added objects.`);
  const p = source.placement;
  const a = {
    id: s.next_addition_id ?? -1,
    source: p.offset,
    model: p.model.offset,
    position: intent.position,
    heading: p.rotation.heading,
    scale: p.scale,
  };
  if (source.recipe.script) a.script = source.recipe.script.offset;
  validateRows(s, [...(s.additions ?? []), a]);
  a.position = a.position.map(Math.fround);
  a.heading = Math.fround(a.heading);
  s.additions ??= [];
  s.additions.push(a);
  s.next_addition_id = a.id - 1;
  s.edits.push({ kind: 'add', target: a.id, before: null, after: structuredClone(a), at: new Date().toISOString() });
  refreshAdditions(s);
  return s.placements.find(p => p.offset === a.id);
}
export function transformAddition(s, intent) {
  const a = s.additions?.find(a => a.id === intent.target);
  if (!a) fail('NO_SUCH_ADDITION', 'This added object no longer exists.');
  if (Object.keys(intent).some(k => !['kind', 'target', 'position', 'heading', 'acknowledged'].includes(k)))
    fail('UNSUPPORTED_FIELD', 'Native additions currently support Move and Rotate; scale stays at 100%.');
  if (intent.position === undefined && intent.heading === undefined)
    fail('NOTHING_TO_CHANGE', 'Give a position or a heading.');
  const before = structuredClone(a),
    after = {
      ...a,
      ...(intent.position !== undefined ? { position: intent.position } : {}),
      ...(intent.heading !== undefined ? { heading: intent.heading } : {}),
    };
  validateRows(
    s,
    s.additions.map(x => (x.id === a.id ? after : x)),
  );
  after.position = after.position.map(Math.fround);
  after.heading = Math.fround(after.heading);
  Object.assign(a, after);
  s.edits.push({
    kind: 'add-transform',
    target: a.id,
    before,
    after: structuredClone(a),
    at: new Date().toISOString(),
  });
  refreshAdditions(s);
  return s.placements.find(p => p.offset === a.id);
}
export function restoreAddition(s, edit, side) {
  const value = edit[side];
  s.additions = (s.additions ?? []).filter(a => a.id !== edit.target);
  if (value) s.additions.push(structuredClone(value));
  s.additions.sort((a, b) => b.id - a.id);
  refreshAdditions(s);
  return s.placements.find(p => p.offset === edit.target) ?? null;
}
export function assertAdditionDependencies(s, intent) {
  if (!(s.additions ?? []).some(a => a.source === intent.target)) return;
  if (intent.kind === 'replace' || (intent.scale !== undefined && intent.scale !== 100))
    fail(
      'ADDITION_SOURCE_IN_USE',
      'Undo the additions based on this source before replacing it or changing its scale.',
    );
}
export function saveAdditionSidecar(s, file, sha256) {
  validateRows(s, s.additions ?? []);
  const document = { version: 1, base_sha256: sha256, additions: structuredClone(s.additions ?? []) };
  const target = file + '.portalforge.json',
    temp = target + '.' + crypto.randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temp, JSON.stringify(document, null, 2));
    fs.renameSync(temp, target);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
  return document;
}
export function loadAdditionSidecar(s) {
  const file = s.file + '.portalforge.json';
  if (!fs.existsSync(file)) return;
  let d;
  try {
    d = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    fail('BAD_ADDITIONS', 'The scene addition file is not valid JSON.');
  }
  if (d.version !== 1 || d.base_sha256 !== s.original_sha256)
    fail('STALE_ADDITIONS', 'The addition file does not match this saved level.');
  validateRows(s, d.additions);
  s.additions = structuredClone(d.additions);
  s.next_addition_id = Math.min(0, ...s.additions.map(a => a.id)) - 1;
  refreshAdditions(s);
  s.lastSave = {
    file: s.file,
    sha256: s.original_sha256,
    additions: structuredClone(s.additions),
    additions_sha256: additionsDigest(s.additions),
    plan: { changes: [], native_additions: structuredClone(s.additions) },
  };
}
export function currentAdditionRecipe(s) {
  validateRows(s, s.additions ?? []);
  return structuredClone(s.additions ?? []);
}
