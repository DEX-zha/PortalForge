import crypto from 'node:crypto';
import { additionSource } from './native-additions.mjs';
export const PROBE_VERSION = 'native-family-v2-observer-ready';
export const familyKey = (s, p) =>
  crypto
    .createHash('sha256')
    .update(
      JSON.stringify([
        PROBE_VERSION,
        s.original_sha256,
        s.archive?.toLowerCase(),
        p.model?.offset,
        p.model?.path,
        p.behavior?.offset ?? null,
        p.behavior?.path ?? null,
        p.scale,
      ]),
    )
    .digest('hex');
export function classifyAddition(s, p, { report = null } = {}) {
  const checks = [
    {
      id: 'level',
      status: s.has_runtime_map && s.archive?.toLowerCase() === 'level/level_027_tutorial.bld' ? 'pass' : 'blocked',
      detail: 'Tutorial runtime map required for this recipe.',
    },
    {
      id: 'model',
      status:
        Number.isInteger(p.model?.offset) && !!p.model?.path && !/[/\\]inviso\.mdl$/i.test(p.model.path)
          ? 'pass'
          : 'blocked',
      detail: 'A resolved visible model is required.',
    },
    {
      id: 'scale',
      status: p.scale === 100 ? 'pass' : 'blocked',
      detail: 'This recipe currently supports the original 100% scale.',
    },
    {
      id: 'identity',
      status: p.native_addition ? 'blocked' : 'pass',
      detail: 'Tests use an original level object as their source.',
    },
    {
      id: 'script',
      status: p.behavior ? 'pending' : 'pass',
      detail: p.behavior
        ? `Script retained: ${p.behavior.path}. Rendering and gameplay need separate checks.`
        : 'No placement script.',
    },
    {
      id: 'shared_model',
      status: 'info',
      detail: p.shared_state?.shared
        ? `${p.shared_state.users} placements share this model. A family test does not validate their different script parameters.`
        : 'No shared model warning.',
    },
  ];
  const blocked = checks.find(c => c.status === 'blocked'),
    known = additionSource(s, p.offset);
  const related = report?.source != null && report.source !== p.offset;
  const status = blocked
    ? 'blocked'
    : known.available
      ? 'confirmed'
      : related
        ? 'family_tested'
        : report?.runtime === 'passed'
          ? 'runtime_passed'
          : report?.runtime === 'inconclusive'
            ? 'inconclusive'
            : report?.runtime === 'failed'
              ? 'test_failed'
              : p.behavior
                ? 'needs_script_test'
                : 'needs_test';
  const labels = {
    blocked: 'Blocked',
    confirmed: 'Add',
    runtime_passed: 'Visual check pending',
    inconclusive: 'Lifecycle check needed',
    family_tested: 'Related source tested',
    test_failed: 'Test failed',
    needs_script_test: 'Needs script test',
    needs_test: 'Needs test',
  };
  const reason =
    blocked?.detail ??
    (known.available
      ? 'Confirmed native addition.'
      : report?.runtime === 'passed'
        ? 'Native creation passed. Visibility and behavior have not been confirmed.'
        : (report?.reason ??
          (p.behavior
            ? 'A scripted source: test its native creation, rendering and behavior.'
            : 'Structurally eligible; native creation and rendering still need testing.')));
  return {
    status,
    label: labels[status],
    reason:
      related && !known.available
        ? `Related source ${report.name ?? report.source} tested: ${report.runtime}. This exact placement is not confirmed.`
        : reason,
    available: known.available && !blocked,
    testable: !blocked,
    family: familyKey(s, p),
    checks,
    report,
  };
}
export function groupCandidates(s) {
  const map = new Map();
  for (const p of s.placements) {
    const c = classifyAddition(s, p);
    if (!c.testable) continue;
    if (!map.has(c.family))
      map.set(c.family, {
        family: c.family,
        representative: p.offset,
        name: p.name,
        script: p.behavior?.path ?? null,
        model: p.model.path,
        members: [],
      });
    map.get(c.family).members.push(p.offset);
  }
  return [...map.values()];
}
