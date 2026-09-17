// Whether an object can be added to the game, and why. Every placement gets a list of checks (level, model,
// scale, identity, recipe, test report) and one status derived from them, so the Project pane shows a reason
// rather than a disabled button.
//
// A family is every placement sharing a model, a behaviour script and a scale in one level. A test report is
// stored per family, but it only ever confirms the exact source that was booted: the others stay candidates.
import { additionSource } from './native-additions.mjs';
import { sha256 } from '../util/hash.mjs';
import { isTutorial } from './levels.mjs';
import { nativeParamsFor } from './native-params.mjs';

// Part of the family key: bumping it retires every stored report, which is how a change of recipe stops an
// old failure (or an old success) from being reused.
export const PROBE_VERSION = 'native-family-v2-observer-ready';

const ORIGINAL_SCALE = 100;
const INVISIBLE_MODEL = /[/\\]inviso\.mdl$/i; // the engine's placeholder for objects with nothing to draw

const LABELS = {
  blocked: 'Blocked',
  confirmed: 'Add',
  runtime_passed: 'Visual check pending',
  inconclusive: 'Lifecycle check needed',
  family_tested: 'Related source tested',
  test_failed: 'Test failed',
  needs_script_test: 'Needs script test',
  needs_test: 'Needs test',
};

// What a stored report says about the runtime, mapped to the status it gives an unconfirmed placement.
const STATUS_BY_RUNTIME = { passed: 'runtime_passed', inconclusive: 'inconclusive', failed: 'test_failed' };

export const familyKey = (session, placement) =>
  sha256(
    JSON.stringify([
      PROBE_VERSION,
      session.original_sha256,
      session.archive?.toLowerCase(),
      placement.model?.offset,
      placement.model?.path,
      placement.behavior?.offset ?? null,
      placement.behavior?.path ?? null,
      placement.scale,
    ]),
  );

const check = (id, passes, detail) => ({ id, status: passes ? 'pass' : 'blocked', detail });

// The recipe needs to know where the level sits in memory: the tutorial's runtime map says so for the tutorial,
// a scene snapshot for any other level (native-params.mjs).
function levelCheck(session) {
  if (isTutorial(session.archive))
    return check('level', !!session.has_runtime_map, 'Tutorial runtime map required for this recipe.');
  const params = nativeParamsFor(session);
  return check('level', params.available, params.reason ?? 'Level parameters read from its scene snapshot.');
}

function structuralChecks(session, placement) {
  const { model, behavior } = placement;
  const visibleModel = Number.isInteger(model?.offset) && !!model?.path && !INVISIBLE_MODEL.test(model.path);
  return [
    levelCheck(session),
    check('model', visibleModel, 'A resolved visible model is required.'),
    check('scale', placement.scale === ORIGINAL_SCALE, 'This recipe currently supports the original 100% scale.'),
    check('identity', !placement.native_addition, 'Tests use an original level object as their source.'),
    {
      id: 'script',
      // A script never blocks a test: it is kept as it is, and what it does in game is judged separately.
      status: behavior ? 'pending' : 'pass',
      detail: behavior
        ? `Script retained: ${behavior.path}. Rendering and gameplay need separate checks.`
        : 'No placement script.',
    },
    {
      id: 'shared_model',
      status: 'info',
      detail: placement.shared_state?.shared
        ? `${placement.shared_state.users} placements share this model. A family test does not validate their different script parameters.`
        : 'No shared model warning.',
    },
  ];
}

// The status, in order of precedence: a failed structural check, then a confirmed recipe, then a report about
// a sibling of the same family, then a report about this exact source, then nothing known at all.
function statusOf({ blocked, confirmed, relatedReport, report, scripted }) {
  if (blocked) return 'blocked';
  if (confirmed) return 'confirmed';
  if (relatedReport) return 'family_tested';
  return STATUS_BY_RUNTIME[report?.runtime] ?? (scripted ? 'needs_script_test' : 'needs_test');
}

function reasonOf({ blocked, confirmed, relatedReport, report, scripted }) {
  // A sibling's result is the most useful thing to say about an unconfirmed placement, even a blocked one.
  if (relatedReport && !confirmed) {
    return `Related source ${report.name ?? report.source} tested: ${report.runtime}. This exact placement is not confirmed.`;
  }
  if (blocked) return blocked.detail;
  if (confirmed) return 'Confirmed native addition.';
  if (report?.runtime === 'passed') return 'Native creation passed. Visibility and behavior have not been confirmed.';
  if (report?.reason != null) return report.reason;
  return scripted
    ? 'A scripted source: test its native creation, rendering and behavior.'
    : 'Structurally eligible; native creation and rendering still need testing.';
}

export function classifyAddition(session, placement, { report = null } = {}) {
  const checks = structuralChecks(session, placement);
  const facts = {
    blocked: checks.find(c => c.status === 'blocked'),
    confirmed: additionSource(session, placement.offset).available,
    // A report is filed under the family, so it may describe another member than the one being classified.
    relatedReport: report?.source != null && report.source !== placement.offset,
    report,
    scripted: !!placement.behavior,
  };
  const status = statusOf(facts);
  return {
    status,
    label: LABELS[status],
    reason: reasonOf(facts),
    available: facts.confirmed && !facts.blocked,
    testable: !facts.blocked,
    family: familyKey(session, placement),
    checks,
    report,
  };
}

// One entry per testable family, with the first member as its representative: what a test campaign iterates.
export function groupCandidates(session) {
  const families = new Map();
  for (const placement of session.placements) {
    const classified = classifyAddition(session, placement);
    if (!classified.testable) continue;
    if (!families.has(classified.family)) {
      families.set(classified.family, {
        family: classified.family,
        representative: placement.offset,
        name: placement.name,
        script: placement.behavior?.path ?? null,
        model: placement.model.path,
        members: [],
      });
    }
    families.get(classified.family).members.push(placement.offset);
  }
  return [...families.values()];
}
