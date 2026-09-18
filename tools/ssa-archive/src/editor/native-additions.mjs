// Native additions: extra instances created by the game itself during launch, using confirmed or experimental
// sources as described below, without
// replacing any existing object and without inserting a byte into the level.
//
// An addition lives in the session and in a sidecar next to the saved level (<level>.portalforge.json). The
// level bytes never change for it; the patch carries a Gecko companion compiled by native-patch.mjs.
//
// Any resident object of the level can be a source (feature 007, constitution 1.2.0). A source with a confirmed
// recipe is a confirmed addition; any other is an experimental addition: marked as such in the session, the
// sidecar and the patch, created from the activation manager, and verified from memory by every launch that
// carries it. The proof follows the addition instead of gating it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assertAdditions, compileNativePatch, nativeCapacity } from './native-patch.mjs';
import { nativeParamsFor } from './native-params.mjs';
import { sha256 } from '../util/hash.mjs';
import { isTutorial } from './levels.mjs';

const recipes = JSON.parse(fs.readFileSync(new URL('./native-recipes.json', import.meta.url), 'utf8'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const ADDITION_FINDING = 'level.prop.native-addition';
const SIDECAR_SUFFIX = '.portalforge.json';
const SIDECAR_VERSION = 1;
const ORIGINAL_SCALE = 100; // the file stores 100 for unit scale; the recipe is only proven at that scale
// What the editor accepts in one scene. It is a guard against a runaway scene, not a measure: what the game
// itself can hold is what the readings of a launch say (specs/007-unlimited-additions/validation.md).
export const ADDITION_LIMIT = 590;

// Fields an intent may carry. Anything else is refused rather than ignored, so a caller cannot believe a
// property was applied when the recipe does not support it (scale, for one).
const ADD_FIELDS = ['kind', 'source', 'position'];
const TRANSFORM_FIELDS = ['kind', 'target', 'position', 'heading', 'acknowledged'];

// A refusal the editor shows to the user: `error` is the stable code, the message is the explanation.
const fail = (error, reason) => {
  throw Object.assign(new Error(`${error}: ${reason}`), { error });
};

const fileName = filePath =>
  String(filePath ?? '')
    .split(/[/\\]/)
    .at(-1)
    .toLowerCase();

const additionsOf = session => session.additions ?? [];
const placementAt = (session, offset) => session.placements.find(p => p.offset === offset);
const hasUnknownField = (intent, allowed) => Object.keys(intent).some(key => !allowed.includes(key));

// Identifies the additions a save or a patch was built from, so a stale one can be recognised.
export const additionsDigest = additions => sha256(JSON.stringify(additions ?? []));

function findingConfirmed(id = ADDITION_FINDING) {
  try {
    const finding = JSON.parse(fs.readFileSync(path.join(root, 'docs/findings/records', id + '.json')));
    return finding.confidence === 'CONFIRMED' && finding.editable === true;
  } catch {
    return false; // an unreadable record confirms nothing
  }
}

// A recipe names an exact source: the placement offset, its model file and, when it has one, its behaviour
// script. A placement that merely looks similar does not match.
function recipeFor(placement, offset) {
  return recipes.find(recipe => {
    if (recipe.source !== offset) return false;
    if (fileName(placement?.model?.path) !== recipe.model.toLowerCase()) return false;
    if (!recipe.script) return !placement?.behavior;
    return (
      placement?.behavior?.offset === recipe.script.offset &&
      fileName(placement.behavior.path) === recipe.script.name.toLowerCase()
    );
  });
}

// Whether the placement at `offset` can be added, the reason when it cannot, and what stands behind it:
// `confirmed` when an exact recipe and its finding are CONFIRMED, `experimental` otherwise. The checks run from
// the most general to the most specific, and the first that fails is the reason reported.
export function additionSource(session, offset) {
  const placement = placementAt(session, offset);
  const recipe = recipeFor(placement, offset);
  // An addition only names file offsets, so nothing about the level has to be known to make one: where the
  // level sits in memory matters when the patch is compiled, or at the launch that measures it (native-live.mjs).
  const checks = [
    [!!placement, 'This object no longer exists.'],
    [findingConfirmed(), 'Native additions are still being validated.'],
    [!placement?.native_addition, 'Add from the original object rather than from one of its copies.'],
    [placement?.scale === ORIGINAL_SCALE, 'The source must keep its original 100% scale for native addition.'],
  ];
  const reason = checks.find(([passes]) => !passes)?.[1] ?? null;
  const confirmed = !reason && !!recipe && findingConfirmed(recipe.finding) && isTutorial(session.archive);
  return {
    placement,
    recipe,
    available: !reason,
    reason,
    evidence: reason ? null : confirmed ? 'confirmed' : 'experimental',
  };
}

// How the patch of a scene is compiled. On a level that has been measured (the tutorial, or any level with a
// scene snapshot) the table is compiled in with the level's own parameters: the slot layout for as long as it
// fits, the compact table past it. On a level never measured the patch carries the live routine, and the launch
// measures the level and writes the table into the game. A scene exceeding the compiled table also uses
// the live routine, even on a measured level, with the launch refilling batches.
export function additionCompileOptions(session, additions) {
  const params = nativeParamsFor(session);
  const count = additions.length;
  if (count > ADDITION_LIMIT) throw Error(`This editor holds at most ${ADDITION_LIMIT} added objects in a scene.`);
  const live = () => {
    assertAdditions(additions);
    return { layout: 'live', capacity: nativeCapacity({ layout: 'live' }) };
  };
  if (!params.available) return live();
  const attempt = layout => {
    try {
      compileNativePatch(additions, { ...params.options, layout, limit: Math.max(count, 1) });
      return true;
    } catch (e) {
      if (/capacity/.test(e.message)) return false;
      throw e;
    }
  };
  if (!count || attempt('slot')) return { ...params.options, layout: 'slot', limit: Math.max(count, 1) };
  if (attempt('table')) return { ...params.options, layout: 'table', limit: count };
  // More than a compiled table holds: the live routine, refilled by the launch while the game runs. Such a scene
  // needs a launch from the editor; played without it, the routine finds an empty table and creates nothing.
  return live();
}

// Every addition must still match its source, and the whole set must compile into the Gecko budget.
function validateAdditions(session, additions) {
  if (!Array.isArray(additions)) fail('BAD_ADDITIONS', 'Additions must be a list.');
  for (const addition of additions) {
    if (!addition || typeof addition !== 'object') {
      fail('BAD_ADDITIONS', 'Each addition must contain a source and a transform.');
    }
    const source = additionSource(session, addition.source);
    if (!source.available) fail('ADDITION_SOURCE_UNAVAILABLE', source.reason);
    if ((addition.model ?? null) !== (source.placement.model?.offset ?? null)) {
      fail('ADDITION_SOURCE_CHANGED', 'An addition source changed its model. Undo that change before exporting.');
    }
    if ((addition.script ?? null) !== (source.placement.behavior?.offset ?? null)) {
      fail('ADDITION_SOURCE_CHANGED', 'An addition script does not match its source.');
    }
    if (!!addition.experimental !== (source.evidence === 'experimental')) {
      fail('ADDITION_SOURCE_CHANGED', 'The evidence behind an addition changed. Add it again.');
    }
  }
  if (!additions.length) return;
  try {
    additionCompileOptions(session, additions);
  } catch (e) {
    fail(/holds at most/.test(e.message) ? 'ADDITION_LIMIT' : 'BAD_ADDITIONS', e.message);
  }
}

// The game stores single-precision floats, so the session keeps what will actually be written.
function toStoredPrecision(addition) {
  addition.position = addition.position.map(Math.fround);
  addition.heading = Math.fround(addition.heading);
}

// Rebuilds the placements that stand for additions. They are derived, never stored: an addition appears in the
// hierarchy as a copy of its source, with a negative identity so it can never collide with a file offset.
export function refreshAdditions(session) {
  session.placements = session.placements.filter(p => !p.native_addition);
  for (const addition of additionsOf(session)) {
    const source = placementAt(session, addition.source);
    if (!source) fail('ADDITION_SOURCE_MISSING', 'The source of a native addition is missing.');
    const copy = structuredClone(source);
    copy.offset = addition.id;
    copy.span = 0;
    copy.name = `${source.name} (Copy ${-addition.id})`;
    copy.position = [...addition.position];
    copy.rotation = { heading: addition.heading };
    copy.scale = addition.scale;
    copy.native_addition = { id: addition.id, source: addition.source };
    copy.shared_state = null;
    const recipe = additionSource(session, addition.source).recipe;
    copy.evidence = {
      ...copy.evidence,
      layout: addition.experimental
        ? 'experimental addition: verified from memory by every launch'
        : `${recipe.finding} (CONFIRMED)`,
    };
    session.placements.push(copy);
  }
}

function recordEdit(session, kind, target, before, after) {
  session.edits.push({ kind, target, before, after: structuredClone(after), at: new Date().toISOString() });
}

export function applyAddition(session, intent) {
  if (session.locked || session.lastLaunch?.running) {
    fail('SESSION_LOCKED', 'Stop this editor’s Dolphin before adding an object.');
  }
  if (hasUnknownField(intent, ADD_FIELDS)) fail('BAD_ADDITION', 'An addition takes a source and a position.');
  const source = additionSource(session, intent.source);
  if (!source.available) fail('ADDITION_SOURCE_UNAVAILABLE', source.reason);
  const { placement } = source;
  const addition = {
    id: session.next_addition_id ?? -1,
    source: placement.offset,
    model: placement.model?.offset ?? null,
    position: intent.position,
    heading: placement.rotation.heading,
    scale: placement.scale,
  };
  if (placement.behavior) addition.script = placement.behavior.offset;
  if (source.evidence === 'experimental') addition.experimental = true;
  validateAdditions(session, [...additionsOf(session), addition]);
  toStoredPrecision(addition);

  session.additions ??= [];
  session.additions.push(addition);
  session.next_addition_id = addition.id - 1;
  recordEdit(session, 'add', addition.id, null, addition);
  refreshAdditions(session);
  return placementAt(session, addition.id);
}

export function transformAddition(session, intent) {
  const addition = session.additions?.find(a => a.id === intent.target);
  if (!addition) fail('NO_SUCH_ADDITION', 'This added object no longer exists.');
  if (hasUnknownField(intent, TRANSFORM_FIELDS)) {
    fail('UNSUPPORTED_FIELD', 'Native additions currently support Move and Rotate; scale stays at 100%.');
  }
  if (intent.position === undefined && intent.heading === undefined) {
    fail('NOTHING_TO_CHANGE', 'Give a position or a heading.');
  }

  const before = structuredClone(addition);
  const after = {
    ...addition,
    ...(intent.position !== undefined ? { position: intent.position } : {}),
    ...(intent.heading !== undefined ? { heading: intent.heading } : {}),
  };
  validateAdditions(
    session,
    session.additions.map(other => (other.id === addition.id ? after : other)),
  );
  toStoredPrecision(after);

  Object.assign(addition, after);
  recordEdit(session, 'add-transform', addition.id, before, addition);
  refreshAdditions(session);
  return placementAt(session, addition.id);
}

// Undo and redo: puts the addition back to the `before` or `after` side of an edit; a null side removes it.
export function restoreAddition(session, edit, side) {
  const value = edit[side];
  session.additions = additionsOf(session).filter(a => a.id !== edit.target);
  if (value) session.additions.push(structuredClone(value));
  session.additions.sort((a, b) => b.id - a.id);
  refreshAdditions(session);
  return placementAt(session, edit.target) ?? null;
}

// A source that additions depend on cannot be replaced or rescaled: the additions would silently change with it.
export function assertAdditionDependencies(session, intent) {
  if (!additionsOf(session).some(a => a.source === intent.target)) return;
  const rescales = intent.scale !== undefined && intent.scale !== ORIGINAL_SCALE;
  if (intent.kind === 'replace' || rescales) {
    fail(
      'ADDITION_SOURCE_IN_USE',
      'Undo the additions based on this source before replacing it or changing its scale.',
    );
  }
}

// Written through a temporary file and a rename, so an interrupted save never leaves half a sidecar behind.
export function saveAdditionSidecar(session, file, baseSha256) {
  validateAdditions(session, additionsOf(session));
  const document = {
    version: SIDECAR_VERSION,
    base_sha256: baseSha256,
    additions: structuredClone(additionsOf(session)),
  };
  const target = file + SIDECAR_SUFFIX;
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(document, null, 2));
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return document;
}

// Restores the additions saved with a level. The sidecar names the exact level it belongs to, and is refused
// for any other: additions are positions in one level's space and recipes checked against one level's objects.
export function loadAdditionSidecar(session) {
  const file = session.file + SIDECAR_SUFFIX;
  if (!fs.existsSync(file)) return;
  let document;
  try {
    document = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    fail('BAD_ADDITIONS', 'The scene addition file is not valid JSON.');
  }
  if (document.version !== SIDECAR_VERSION || document.base_sha256 !== session.original_sha256) {
    fail('STALE_ADDITIONS', 'The addition file does not match this saved level.');
  }
  validateAdditions(session, document.additions);

  session.additions = structuredClone(document.additions);
  session.next_addition_id = Math.min(0, ...session.additions.map(a => a.id)) - 1;
  refreshAdditions(session);
  session.lastSave = {
    file: session.file,
    sha256: session.original_sha256,
    additions: structuredClone(session.additions),
    additions_sha256: additionsDigest(session.additions),
    plan: { changes: [], native_additions: structuredClone(session.additions) },
  };
}

// The additions as the patch builder needs them: validated, and detached from the session.
export function currentAdditionRecipe(session) {
  validateAdditions(session, additionsOf(session));
  return structuredClone(additionsOf(session));
}
