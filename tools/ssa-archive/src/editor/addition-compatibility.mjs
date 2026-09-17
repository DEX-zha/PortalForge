// What is known about adding an object to the game. Every placement gets a list of checks (level, model, scale,
// identity, recipe, report) and one status derived from them, so the Project pane shows the evidence next to Add.
//
// Since feature 007 the evidence no longer gates the addition: any resident object of a level whose place in
// memory is known can be added, and every launch verifies from memory what it carried and files the result
// (addition-reports.mjs). A status says how much is known: confirmed by a finding, verified in game, a related
// source verified, failed in game, or not verified yet. Only what cannot work is blocked.
//
// A family is every placement sharing a model, a behaviour script and a scale in one level. A report is stored
// per family and names the exact source that was in the game: the others are related, not verified.
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
  runtime_passed: 'Add · verified in game',
  inconclusive: 'Add · lifecycle unclear',
  family_tested: 'Add · related source tested',
  test_failed: 'Add · failed in game',
  needs_script_test: 'Add · script not verified',
  needs_test: 'Add · not verified',
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

// The recipe needs to know where the level sits in memory: a constant on the tutorial, the scene snapshot's
// measure on a level that has one (native-params.mjs), and otherwise the measure the first launch takes when it
// reaches the level (native-live.mjs). None of them blocks an addition.
function levelCheck(session) {
  const measured = nativeParamsFor(session).available;
  return {
    id: 'level',
    status: measured ? 'pass' : 'info',
    detail: isTutorial(session.archive)
      ? 'The tutorial sits at its validated place in memory.'
      : measured
        ? 'Level measured: its table is compiled into the patch.'
        : 'Level not measured yet: the first launch from the editor measures it and writes the additions into the game.',
  };
}

function structuralChecks(session, placement) {
  const { model, behavior } = placement;
  const visibleModel = Number.isInteger(model?.offset) && !!model?.path && !INVISIBLE_MODEL.test(model.path);
  return [
    levelCheck(session),
    {
      id: 'model',
      // Triggers, spawners, enemy set-ups and cameras have nothing to draw. The game creates them like any other
      // record; a capture cannot show them, so their proof is the memory check of the launch.
      status: visibleModel ? 'pass' : 'info',
      detail: visibleModel
        ? 'Visible model.'
        : 'Nothing to draw: this object is verified from memory, not from a capture.',
    },
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

const launches = report => (report?.launches?.length ? ` (${report.launches.length} launch(es))` : '');

function reasonOf({ blocked, confirmed, relatedReport, report, scripted }) {
  // A sibling's result is the most useful thing to say about an unconfirmed placement, even a blocked one.
  if (relatedReport && !confirmed) {
    return `Related source ${report.name ?? report.source} in game: ${report.runtime}${launches(report)}. This exact placement has not been in the game yet; the next launch verifies it.`;
  }
  if (blocked) return blocked.detail;
  if (confirmed) return 'Confirmed native addition.';
  if (report?.runtime === 'passed')
    return `Created by the game and verified from memory${launches(report)}. Look at it in game to judge how it renders and behaves.`;
  if (report?.reason != null) return `${report.reason} It can still be added; the next launch verifies it again.`;
  return scripted
    ? 'Not verified yet: a scripted source. The next launch that carries it verifies its creation from memory.'
    : 'Not verified yet. The next launch that carries it verifies its creation from memory.';
}

export function classifyAddition(session, placement, { report = null } = {}) {
  const checks = structuralChecks(session, placement);
  const facts = {
    blocked: checks.find(c => c.status === 'blocked'),
    confirmed: additionSource(session, placement.offset).evidence === 'confirmed',
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
    // Addable whenever nothing blocks it; `confirmed` and the report say how much is known.
    available: !facts.blocked,
    experimental: !facts.blocked && !facts.confirmed,
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
