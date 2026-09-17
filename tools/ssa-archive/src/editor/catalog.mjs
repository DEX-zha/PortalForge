// The Project catalogue and the drop transaction behind drag and drop.
//
// A drop is prepared, then committed. Preparing changes nothing: it returns the plan, its rules and an opaque
// token bound to the exact bytes and history it was computed from. Committing requires that token and an
// acknowledgement of every critical rule, so a plan can never be applied to a level it was not computed for.
import crypto from 'node:crypto';
import { sceneRoles } from './scene-roles.mjs';
import { interchangeable, planReplace, applyEdit } from './session.mjs';
import { classifyAddition, groupCandidates } from './addition-compatibility.mjs';
import { readFamilyReport } from './addition-probe.mjs';
import { NATIVE_LIMIT } from './native-patch.mjs';

const TOKEN_BYTES = 24;

// One prepared drop per session. Keyed weakly, so closing a session drops its pending plan with it.
const pendingDrops = new WeakMap();

const fail = (error, reason) => {
  throw Object.assign(new Error(`${error}: ${reason}`), { error });
};

// Changes with every byte of the level and with every edit, including an undone one: a plan prepared before
// either no longer describes the level it would be applied to.
const revisionOf = session =>
  crypto
    .createHash('sha256')
    .update(session.buffer)
    .update(String(session.edit_revision ?? 0))
    .digest('hex');

function assertUnlocked(session) {
  if (session.locked || session.lastLaunch?.running) {
    fail('SESSION_LOCKED', 'Stop this editor’s Dolphin instance before placing an object.');
  }
}

function categoryOf(placement, inactiveOffsets) {
  if (inactiveOffsets.has(placement.offset)) return 'resource';
  if (placement.behavior) return 'scripted';
  if (placement.model?.offset == null) return 'marker';
  return 'static';
}

const UNAVAILABLE_BY_CATEGORY = {
  resource: 'Resource or inactive object: in-game creation is not guaranteed.',
  scripted: 'Scripted object: copying is not supported in this browser.',
  marker: 'No visible model to copy.',
};

// Why a placement cannot be copied over another one, or null when it can.
function copyRefusal(session, placement, category) {
  if (!session.has_runtime_map) return 'A runtime map is required to copy objects.';
  if (UNAVAILABLE_BY_CATEGORY[category]) return UNAVAILABLE_BY_CATEGORY[category];
  const hasSlot = session.placements.some(
    other => other.offset !== placement.offset && interchangeable(session, placement.offset, other.offset),
  );
  return hasSlot ? null : 'No slot of the same size.';
}

function catalogEntry(session, placement, inactiveOffsets) {
  const category = categoryOf(placement, inactiveOffsets);
  const reason = copyRefusal(session, placement, category);
  // The family key is needed to find the stored report, and the report refines the classification.
  const family = classifyAddition(session, placement).family;
  return {
    offset: placement.offset,
    name: placement.name,
    model: placement.model?.path ?? null,
    layers: placement.layers,
    category,
    available: !reason,
    reason,
    addition: classifyAddition(session, placement, { report: readFamilyReport(family) }),
    native_addition: !!placement.native_addition,
  };
}

export function catalog(session) {
  const inactiveOffsets = new Set(sceneRoles(session).map(role => role.offset));
  const entries = session.placements.map(placement => catalogEntry(session, placement, inactiveOffsets));
  const counts = {};
  for (const entry of entries) counts[entry.addition.status] = (counts[entry.addition.status] ?? 0) + 1;
  return {
    addition_mode: 'native',
    addition_capacity: { used: session.additions?.length ?? 0, limit: NATIVE_LIMIT },
    entries,
    compatibility: { counts, families: groupCandidates(session) },
  };
}

// A position the game can store: three numbers that are still finite once rounded to single precision.
const isStorablePosition = position =>
  Array.isArray(position) &&
  position.length === 3 &&
  position.every(value => Number.isFinite(value) && Number.isFinite(Math.fround(value)));

export function prepareDrop(session, body) {
  assertUnlocked(session);
  pendingDrops.delete(session); // a new preparation always invalidates the previous one
  const source = catalog(session).entries.find(entry => entry.offset === body.source);
  if (!source?.available) fail('SOURCE_UNAVAILABLE', source?.reason ?? 'Source object is missing from this session.');
  if (!isStorablePosition(body.position)) fail('BAD_VALUE', 'Position must contain three finite numbers.');

  const intent = { kind: 'replace', source: body.source, target: body.target, position: [...body.position] };
  const prepared = planReplace(session, intent);
  if (prepared.error || !prepared.plan || prepared.plan.validation.status !== 'VALID') {
    fail(prepared.error ?? 'PLAN_INVALID', prepared.reason ?? 'Invalid replacement plan.');
  }
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  pendingDrops.set(session, { token, revision: revisionOf(session), intent });
  return { token, plan: prepared.plan, rules: prepared.plan.safety ?? [] };
}

// The intent applied is the one the server prepared, never one sent back by the client.
export function commitDrop(session, body) {
  assertUnlocked(session);
  const draft = pendingDrops.get(session);
  if (!draft || body.token !== draft.token || draft.revision !== revisionOf(session)) {
    fail('STALE_PLAN', 'This plan has expired: prepare the drop again.');
  }
  if (!Array.isArray(body.acknowledged ?? [])) fail('BAD_VALUE', 'Invalid acknowledgements.');
  const result = applyEdit(session, { ...draft.intent, acknowledged: body.acknowledged ?? [] });
  pendingDrops.delete(session);
  return result;
}
