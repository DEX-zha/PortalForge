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

const pending = new WeakMap();
const fail = (error, reason) => {
  throw Object.assign(new Error(`${error}: ${reason}`), { error });
};
const revision = s =>
  crypto
    .createHash('sha256')
    .update(s.buffer)
    .update(String(s.edit_revision ?? 0))
    .digest('hex');
const unlocked = s => {
  if (s.locked || s.lastLaunch?.running)
    fail('SESSION_LOCKED', 'Stop this editor’s Dolphin instance before placing an object.');
};

export function catalog(s) {
  const inactive = new Set(sceneRoles(s).map(r => r.offset));
  const entries = s.placements.map(p => {
    const category = inactive.has(p.offset)
      ? 'resource'
      : p.behavior
        ? 'scripted'
        : p.model?.offset == null
          ? 'marker'
          : 'static';
    const reason = !s.has_runtime_map
      ? 'A runtime map is required to copy objects.'
      : category === 'resource'
        ? 'Resource or inactive object: in-game creation is not guaranteed.'
        : category === 'scripted'
          ? 'Scripted object: copying is not supported in this browser.'
          : category === 'marker'
            ? 'No visible model to copy.'
            : !s.placements.some(q => q.offset !== p.offset && interchangeable(s, p.offset, q.offset))
              ? 'No slot of the same size.'
              : null;
    const preliminary = classifyAddition(s, p),
      addition = classifyAddition(s, p, { report: readFamilyReport(preliminary.family) });
    return {
      offset: p.offset,
      name: p.name,
      model: p.model?.path ?? null,
      layers: p.layers,
      category,
      available: !reason,
      reason,
      addition,
      native_addition: !!p.native_addition,
    };
  });
  const counts = {};
  for (const e of entries) counts[e.addition.status] = (counts[e.addition.status] ?? 0) + 1;
  return {
    addition_mode: 'native',
    addition_capacity: { used: s.additions?.length ?? 0, limit: NATIVE_LIMIT },
    entries,
    compatibility: { counts, families: groupCandidates(s) },
  };
}

export function prepareDrop(s, body) {
  unlocked(s);
  pending.delete(s);
  const source = catalog(s).entries.find(p => p.offset === body.source);
  if (!source?.available) fail('SOURCE_UNAVAILABLE', source?.reason ?? 'Source object is missing from this session.');
  if (
    !Array.isArray(body.position) ||
    body.position.length !== 3 ||
    body.position.some(v => !Number.isFinite(v) || !Number.isFinite(Math.fround(v)))
  )
    fail('BAD_VALUE', 'Position must contain three finite numbers.');
  const intent = { kind: 'replace', source: body.source, target: body.target, position: [...body.position] };
  const prepared = planReplace(s, intent);
  if (prepared.error || !prepared.plan || prepared.plan.validation.status !== 'VALID')
    fail(prepared.error ?? 'PLAN_INVALID', prepared.reason ?? 'Invalid replacement plan.');
  const token = crypto.randomBytes(24).toString('hex');
  pending.set(s, { token, revision: revision(s), intent });
  return { token, plan: prepared.plan, rules: prepared.plan.safety ?? [] };
}

export function commitDrop(s, body) {
  unlocked(s);
  const draft = pending.get(s);
  if (!draft || body.token !== draft.token || draft.revision !== revision(s))
    fail('STALE_PLAN', 'This plan has expired: prepare the drop again.');
  if (!Array.isArray(body.acknowledged ?? [])) fail('BAD_VALUE', 'Invalid acknowledgements.');
  const result = applyEdit(s, { ...draft.intent, acknowledged: body.acknowledged ?? [] });
  pending.delete(s);
  return result;
}
