// Native additions: extra instances created by the game itself at boot, from a confirmed recipe, without
// replacing any existing object and without inserting a byte into the level.
//
// An addition lives in the session and in a sidecar next to the saved level (<level>.portalforge.json). The
// level bytes never change for it; the patch carries a Gecko companion compiled by native-patch.mjs. A source
// may only be added when its recipe and the finding behind it are CONFIRMED and editable.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NATIVE_LIMIT, compileNativePatch } from './native-patch.mjs';
import { nativeParamsFor } from './native-params.mjs';
import { sha256 } from '../util/hash.mjs';
import { isTutorial } from './levels.mjs';

const recipes = JSON.parse(fs.readFileSync(new URL('./native-recipes.json', import.meta.url), 'utf8'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const ADDITION_FINDING = 'level.prop.native-addition';
const SIDECAR_SUFFIX = '.portalforge.json';
const SIDECAR_VERSION = 1;
const ORIGINAL_SCALE = 100; // the file stores 100 for unit scale; the recipe is only proven at that scale

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

// Whether the placement at `offset` can be added, and the reason when it cannot. The checks run from the most
// general to the most specific, and the first that fails is the reason reported.
export function additionSource(session, offset) {
  const placement = placementAt(session, offset);
  const recipe = recipeFor(placement, offset);
  const checks = [
    [findingConfirmed(), 'Native additions are still being validated.'],
    [
      session.has_runtime_map && isTutorial(session.archive),
      'Native additions currently support the tutorial with its runtime map.',
    ],
    [recipe && findingConfirmed(recipe.finding), 'This object has not been validated for native addition yet.'],
    [placement?.scale === ORIGINAL_SCALE, 'The source must keep its original 100% scale for native addition.'],
  ];
  const reason = checks.find(([passes]) => !passes)?.[1] ?? null;
  return { placement, recipe, available: !reason, reason };
}

// Every addition must still match its confirmed source, and the whole set must compile into the Gecko budget.
function validateAdditions(session, additions) {
  if (!Array.isArray(additions) || additions.length > NATIVE_LIMIT) {
    fail('BAD_ADDITIONS', `At most ${NATIVE_LIMIT} native additions are supported.`);
  }
  for (const addition of additions) {
    if (!addition || typeof addition !== 'object') {
      fail('BAD_ADDITIONS', 'Each addition must contain a source and a transform.');
    }
    const source = additionSource(session, addition.source);
    if (!source.available) fail('ADDITION_SOURCE_UNAVAILABLE', source.reason);
    if (addition.model !== source.placement.model.offset) {
      fail('ADDITION_SOURCE_CHANGED', 'An addition source changed its model. Undo that change before exporting.');
    }
    if ((addition.script ?? null) !== (source.recipe.script?.offset ?? null)) {
      fail('ADDITION_SOURCE_CHANGED', 'An addition script does not match its confirmed source.');
    }
  }
  if (!additions.length) return;
  try {
    const params = nativeParamsFor(session);
    if (!params.available) throw Error(params.reason);
    compileNativePatch(additions, params.options);
  } catch (e) {
    fail('BAD_ADDITIONS', e.message);
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
    copy.evidence = {
      ...copy.evidence,
      layout: `${additionSource(session, addition.source).recipe.finding} (CONFIRMED)`,
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
  if (additionsOf(session).length >= NATIVE_LIMIT) {
    fail('ADDITION_LIMIT', `This patch supports at most ${NATIVE_LIMIT} added objects.`);
  }

  const { placement } = source;
  const addition = {
    id: session.next_addition_id ?? -1,
    source: placement.offset,
    model: placement.model.offset,
    position: intent.position,
    heading: placement.rotation.heading,
    scale: placement.scale,
  };
  if (source.recipe.script) addition.script = source.recipe.script.offset;
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
