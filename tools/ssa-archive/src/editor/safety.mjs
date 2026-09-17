// Safety rules for placement edits (spec 002). Every rule states what it checks, how bad it is, and which
// evidence it rests on, so a refusal can be argued with rather than obeyed blindly.
//
// Severities
//   blocking  the edit cannot produce a loadable file; the planner refuses it
//   critical  observed to break the game, or silently changes objects the user did not ask to change
//   high      a real risk with boot evidence behind it
//   medium    a risk that is plausible but NOT evidenced either way; it needs a boot to settle
//   info      worth knowing, not a risk
//
// Evidence behind the rules:
//   level.pushblock.track-dependency        two boots froze in game after relocating a push block
//   igz.placement.shared-model-record       the confirmed sunflower duplication also renamed the weed model
//                                           for the 25 other placements sharing that record
//   igz.placement.type104-record            the placement layout, boot-confirmed on the tutorial
//   igz.loader.head-span-count-walk         insertion shifts every later walker; only same-size replacement works
export const SEVERITY = ['blocking', 'critical', 'high', 'medium', 'info'];
const rank = s => SEVERITY.indexOf(s);

// Behaviour scripts known to bind an object to level context it cannot find elsewhere.
export const TRACK_BOUND = [
  {
    match: /PushBlock/i,
    why: 'push blocks resolve a track, waypoints and switches at STARTUP (PushBlock_Template.ai, 1415 instructions); two boots froze in game after one was placed on the start island',
    finding: 'level.pushblock.track-dependency',
  },
];

export function assessPlacement(placement, { hasRuntimeMap = false } = {}) {
  const rules = [];
  if (placement.behavior) {
    const track = TRACK_BOUND.find(t => t.match.test(placement.behavior.path ?? ''));
    if (track)
      rules.push({
        id: 'TRACK_BOUND_BEHAVIOUR',
        severity: 'critical',
        finding: track.finding,
        message: `${placement.name} runs ${placement.behavior.path.replace(/^.*\//, '')}: ${track.why}`,
      });
    // The evidence is two data points and they disagree, so this stays medium: the windmill blades carry
    // 027_WindmillProp.ai and moved correctly over two boots, a push block carries PushBlock_Template.ai and
    // froze twice. A behaviour script is a reason to boot before trusting the edit, not a reason to refuse it.
    else
      rules.push({
        id: 'SCRIPTED_PLACEMENT',
        severity: 'medium',
        finding: 'level.pushblock.track-dependency',
        message: `${placement.name} has a behaviour script at +0xA8 (${placement.behavior.path.replace(/^.*\//, '')}); it may depend on level context. Windmill blades moved fine over two boots, a push block froze twice: boot once before trusting it.`,
      });
  }
  if (placement.model.status === 'absent')
    rules.push({
      id: 'MARKER_NO_MODEL',
      severity: 'info',
      finding: 'igz.placement.type104-record',
      message: `${placement.name} resolves no direct model. It may be a marker, trigger or scripted spawner; a script can still create visible objects from it.`,
    });
  if (placement.model.status === 'ambiguous')
    rules.push({
      id: 'AMBIGUOUS_MODEL',
      severity: 'high',
      finding: 'igz.placement.type104-record',
      message: `${placement.name} reaches ${placement.model_candidates.length} model records and none at +0xDC; which one it shows is unknown.`,
    });
  if (placement.model.status === 'indirect')
    rules.push({
      id: 'INDIRECT_MODEL',
      severity: 'info',
      finding: 'igz.placement.type104-record',
      message: `${placement.name} resolves its model through +0x${placement.model.field.toString(16)}, not the usual +0xDC.`,
    });
  if (!hasRuntimeMap)
    rules.push({
      id: 'NO_RUNTIME_MAP',
      severity: 'info',
      finding: 'igz.placement.type104-record',
      message:
        'this level has no runtime fixup map, so pointer fields are structural only. The structural resolver reproduces the runtime answer on the tutorial at 100%, but that is calibration, not proof for this file.',
    });
  return rules.sort((a, b) => rank(a.severity) - rank(b.severity));
}

// A replacement copies the SOURCE blob over the VICTIM blob. Anything inside the victim blob that other
// records point at is rewritten for those other records too.
export function assessReplacement(
  source,
  victim,
  { hasRuntimeMap = false, sharedInVictim = [], spanMatch = true, copied = null } = {},
) {
  const rules = [];
  if (!spanMatch)
    rules.push({
      id: 'SPAN_MISMATCH',
      severity: 'blocking',
      finding: 'igz.loader.head-span-count-walk',
      message: `the copied block is 0x${(copied?.source ?? source.span).toString(16)} bytes and the slot is 0x${(copied?.victim ?? victim.span).toString(16)}; only a same-size replacement keeps the count-bounded walk aligned.`,
    });
  for (const s of sharedInVictim) {
    const isModel = !!(s.path && (/\.(mdl|lvl)$/i.test(s.path) || /(^|\/)models\//i.test(s.path)));
    const what = s.path
      ? `${isModel ? 'the model record' : 'the record'} at 0x${s.offset.toString(16)} (${s.path.replace(/^.*\//, '')})`
      : `the record at 0x${s.offset.toString(16)}`;
    if (s.users > 1 && isModel)
      rules.push({
        id: 'SHARED_MODEL_REWRITE',
        severity: 'critical',
        finding: 'igz.placement.shared-model-record',
        message: `the victim blob holds ${what}, used by ${s.users} placements. Copying over it retextures all of them, as the confirmed sunflower duplication did to 25 weeds.`,
      });
    else if (s.users > 1)
      rules.push({
        id: 'SHARED_RECORD_REWRITE',
        severity: 'critical',
        finding: 'igz.placement.shared-model-record',
        message: `the victim blob holds ${what}, referenced by ${s.users - 1} record(s) outside it. Copying over the blob changes what those references see.`,
      });
    else
      rules.push({
        id: 'OWN_RECORD_REWRITE',
        severity: 'info',
        finding: 'igz.placement.shared-model-record',
        message: `the victim blob holds ${what}, used by nothing outside it, so overwriting it is contained.`,
      });
  }
  const src = assessPlacement(source, { hasRuntimeMap }).filter(r => r.id !== 'NO_RUNTIME_MAP');
  for (const r of src) rules.push({ ...r, id: 'SOURCE_' + r.id, message: 'source: ' + r.message });
  const vic = assessPlacement(victim, { hasRuntimeMap }).filter(
    r => r.id === 'TRACK_BOUND_BEHAVIOUR' || r.id === 'SCRIPTED_PLACEMENT',
  );
  for (const r of vic)
    rules.push({
      ...r,
      id: 'VICTIM_' + r.id,
      severity: r.severity === 'critical' ? 'high' : 'info',
      message: 'victim slot: ' + r.message + ' Its script pointer is overwritten by the source unless kept.',
    });
  if (!hasRuntimeMap)
    rules.push({
      id: 'NO_RUNTIME_MAP',
      severity: 'info',
      finding: 'igz.placement.type104-record',
      message:
        'no runtime fixup map for this level: the pointer fields rebased by the planner are identified structurally.',
    });
  return rules.sort((a, b) => rank(a.severity) - rank(b.severity));
}

export const worst = rules => rules.reduce((w, r) => (rank(r.severity) < rank(w) ? r.severity : w), 'info');
export const blocked = rules => rules.some(r => r.severity === 'blocking');

export function formatRules(rules) {
  if (!rules.length) return '  no safety rule triggered';
  return rules
    .map(r => `  [${r.severity.toUpperCase().padEnd(8)}] ${r.id}: ${r.message}${r.finding ? `  (${r.finding})` : ''}`)
    .join('\n');
}
