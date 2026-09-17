// The inspector: the frozen placement record, the evidence behind each attribute, and the safety rules that
// apply to it (feature 003 T021, T022).
//
// The evidence is not decoration. The project's first principle is that a capability exists only when runtime
// evidence shows it, so an attribute the game itself rewrote at load and an attribute inferred from the file
// structure must not look the same. `runtime-pointer` is marked; everything else reads as structural.

const esc = s =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const hex = n => '0x' + Number(n).toString(16).toUpperCase();
const base = p => (p ? String(p).replace(/^.*[\\/]/, '') : null);

const EVIDENCE_TEXT = {
  'runtime-pointer': 'runtime: the game rewrote this word at load',
  structural: 'structural: read from the file, not confirmed at runtime',
  'structural-only': 'structural only: the runtime map does not confirm this pointer',
  none: null,
};

function row(key, value, evidence) {
  const ev =
    evidence && EVIDENCE_TEXT[evidence]
      ? `<div class="ev ${evidence === 'runtime-pointer' ? 'runtime' : ''}">${esc(EVIDENCE_TEXT[evidence])}</div>`
      : '';
  return `<div class="row"><span class="k">${esc(key)}</span><span class="v">${value}${ev}</span></div>`;
}

export function renderPlacement(
  p,
  safety = [],
  targets = [],
  { hasRuntimeMap = true, script = null, addition = null } = {},
) {
  if (!p) return '<div class="empty">Nothing selected. Click a proxy in the view.</div>';
  const model = p.model.path
    ? `${esc(base(p.model.path))}<div class="ev">${esc(p.model.path)}</div>`
    : `<span class="k">No direct model; this may be a marker or an object generator.</span>`;
  const behaviour = p.behavior
    ? `${esc(base(p.behavior.path))}<div class="ev">${esc(p.behavior.path)}</div>`
    : '<span class="k">none</span>';
  const shared = p.shared_state
    ? p.shared_state.shared
      ? `${p.shared_state.users} placements use this model record${
          p.shared_state.rewritten_by_replacing !== null
            ? `<div class="ev">its bytes live inside ${hex(p.shared_state.rewritten_by_replacing)}, so replacing that blob retextures all of them</div>`
            : ''
        }`
      : 'used by this placement only'
    : '<span class="k">no model record</span>';

  return [
    `<div class="object-heading"><b>${esc(p.name ?? '(unnamed)')}</b><span>Level object</span></div>`,
    '<h2>Transform</h2>',
    // Typed entry and the gizmos produce the same intent, so a value can be read off a report and entered exactly.
    row(
      'Position',
      [0, 1, 2]
        .map(
          i =>
            `<label class="axis-field"><span>${['X', 'Y', 'Z'][i]}</span><input class="num" data-edit="position" data-axis="${i}" aria-label="Position ${['X', 'Y', 'Z'][i]}" value="${p.position[i]}"></label>`,
        )
        .join(' '),
    ),
    row(
      'Orientation',
      `<input class="num" data-edit="heading" aria-label="Orientation" value="${p.rotation.heading}"> &deg;`,
    ),
    row(
      'Scale',
      `<input class="num" data-edit="scale" aria-label="Scale" value="${p.scale}"${p.native_addition ? ' disabled title="Added objects currently keep their original scale"' : ''}> <span class="k">(100 = 1.0)</span>`,
    ),
    script?.movement
      ? `<details class="inspector-fold" ${['resource', 'unsupported_trajectory'].includes(script.movement.kind) ? 'open' : ''}><summary>In-game movement</summary>${renderMovement(script)}</details>`
      : '',
    '<h2>Object</h2>',
    addition
      ? '<details class="inspector-fold" open><summary>Add compatibility: ' +
        esc(addition.label) +
        '</summary><div class="ev">' +
        esc(addition.reason) +
        '</div>' +
        addition.checks.map(c => row(c.id, esc(c.status + ' — ' + c.detail))).join('') +
        (addition.report
          ? row('Latest test', esc(addition.report.runtime + ' · ' + addition.report.runs + ' run(s)')) +
            `<a href="/addition-report/${esc(addition.family)}" target="_blank" rel="noopener">View test screenshots and results</a>`
          : '') +
        '</details>'
      : '',
    row('Model', p.model.path ? esc(base(p.model.path)) : model),
    row('Script', p.behavior ? esc(base(p.behavior.path)) : 'None'),
    script?.clones?.length
      ? row(
          'Script-created objects',
          script.clones
            .map(c => `${esc(c.name)}<div class="ev">${esc(base(c.model) ?? 'no direct model')}</div>`)
            .join('<br>') +
            '<div class="rule medium">Bridge and cannon previews show their initial pose. Animations and changes during gameplay are not simulated.</div>',
        )
      : '',
    script?.scene_role
      ? '<div class="rule medium">Template or initially disabled object: this may be a storage position with no ground beneath it.</div>' +
        (script.movement
          ? ''
          : (script.scene_role.counterparts ?? [])
              .map(c => `<button data-counterpart="${c.offset}">Select ${esc(c.name)} in the level</button>`)
              .join(''))
      : '',
    script?.template_for?.length
      ? '<div class="rule medium">Object used as a template by ' +
        script.template_for.map(s => esc(base(s.path))).join(', ') +
        '. Copies created during gameplay may appear elsewhere than the position stored here.</div>'
      : '',
    script?.trajectory?.supported
      ? `<div class="rule info">Moving also translates the ${script.trajectory.points.length} path points of this object. Its animation is preserved.</div>`
      : script?.animated
        ? '<div class="rule medium">This script contains movement. It may affect copies or debris; its presence alone does not prove that this object position is overwritten.</div>'
        : '',
    row('Layers', p.layers.length ? esc(p.layers.join(', ')) : '<span class="k">Unlayered</span>'),
    p.shared_state?.shared
      ? '<details class="inspector-fold"><summary>Shared model · ' +
        p.shared_state.users +
        ' placements</summary>' +
        row('Usage', shared) +
        '</details>'
      : '',
    safety.length ? '<h2>Review</h2>' + safety.map(renderRule).join('') : '',
    '<details class="inspector-fold"><summary>Advanced duplication</summary>',
    p.native_addition
      ? '<div class="ev">Added object. Move and Rotate are supported. Restart the game after each patch.</div>'
      : renderDuplicate(p, targets, hasRuntimeMap),
    '</details>',
    '<details class="inspector-fold"><summary>Technical details and evidence</summary>',
    p.native_addition
      ? row('Identity', `Added object ${-p.offset}`)
      : row('offset', `${hex(p.offset)}<div class="ev">slot ${hex(p.span)} bytes</div>`),
    row('model', model, p.evidence.model),
    row('behaviour', behaviour, p.evidence.behavior),
    row('layers', esc(p.layers.join(', ')), p.evidence.layers),
    row(
      'resolution',
      esc(p.model.status) + (p.model.field !== null ? ` <span class="k">via +${hex(p.model.field)}</span>` : ''),
    ),
    p.model_candidates.length > 1
      ? row(
          'candidates',
          p.model_candidates.map(c => esc(base(c.path)) + ' <span class="k">+' + hex(c.field) + '</span>').join('<br>'),
        )
      : '',
    `<h2>Layout evidence</h2>`,
    `<div class="ev" style="padding:0 12px 12px">${esc(p.evidence.layout)}</div>`,
    '</details>',
  ].join('');
}

function renderMovement(script) {
  const m = script?.movement;
  if (!m) return '';
  const text = {
    resource:
      'Resource or initially disabled object. Its stored position does not necessarily match visible objects. ' +
      (m.targets?.length
        ? 'Select a placement below before moving it.'
        : 'No matching placement or creator with a direct position was identified for this resource.'),
    trajectory: 'Position and path: private path points move with the object.',
    unsupported_trajectory: 'Unsupported path: moving is blocked to avoid leaving its animation at the old position.',
    initial_position: m.scripted
      ? 'Initial placement position. Its visual effect still needs in-game verification for this object and destination.'
      : 'Position specific to this placement.',
  }[m.kind];
  const targets = (m.targets ?? [])
    .map(
      p =>
        `<button data-counterpart="${p.offset}">${p.relation === 'creator' ? 'Select possible creator' : 'Select placement'} : ${esc(p.name)} · ${p.position.map(v => esc(v)).join(', ')}</button>`,
    )
    .join('');
  return (
    '<div class="movement-info"><div class="k">In-game movement</div><p>' +
    esc(text) +
    '</p>' +
    (m.model_shared
      ? '<div class="ev">Shared model, independent position: moving this object does not move other users of the model.</div>'
      : '') +
    (m.targets?.some(p => p.conditional)
      ? '<div class="ev">Conditional creation: the script uses this creator as a position, but its branch may not run. This link selects an object without editing data.</div>'
      : '') +
    (targets
      ? `<details class="movement-targets" open><summary>Related placements (${m.targets.length})</summary><div>${targets}</div></details>`
      : '') +
    '</div>'
  );
}

export function renderRule(r) {
  return `<div class="rule ${esc(r.severity)}"><span class="id">${esc(r.severity)}</span> ${esc(r.id)}
    <div class="why">${esc(r.message)}</div>
    ${r.finding ? `<div class="why">${esc(r.finding)}</div>` : ''}</div>`;
}

// The per-layer grade bar shown under the layer list: where the risk of a level sits, before anything is selected.
export function renderGrades(grades) {
  const order = ['blocking', 'critical', 'high', 'medium', 'info'];
  const total = order.reduce((n, k) => n + (grades[k] ?? 0), 0) || 1;
  return `<div class="bar">${order
    .map(k => {
      const n = grades[k] ?? 0;
      return n
        ? `<i style="width:${((100 * n) / total).toFixed(1)}%;background:var(--${k === 'blocking' ? 'critical' : k === 'info' ? 'static' : k})" title="${k}: ${n}"></i>`
        : '';
    })
    .join('')}</div>`;
}

// A duplication consumes a slot: the object that was there stops existing. So the panel names the candidates and
// what each one costs, and nothing is confirmable until the plan has been prepared and read.
function renderDuplicate(p, targets = [], hasRuntimeMap = true) {
  // Reading a level structurally is enough to move an object; rewriting its pointer fields is not. Saying so here
  // is the difference between a disabled control and an unexplained one.
  if (!hasRuntimeMap)
    return '<div class="empty">duplication is unavailable on this level: it has no runtime fixup map, so which words are pointers is structural only. Moving, turning and scaling stay available. Produce a map with <code>experiment ptr-scan</code> to duplicate here.</div>';
  if (!targets.length)
    return '<div class="empty">no slot of this size to sacrifice, so this object cannot be duplicated</div>';
  const options = targets
    .slice(0, 200)
    .map(
      t =>
        `<option value="${t.offset}">${esc(t.name ?? hex(t.offset))}${t.layers?.length ? ' — ' + esc(t.layers.join(', ')) : ''}</option>`,
    )
    .join('');
  return `<div class="row"><span class="k">sacrificable slots</span><span class="v">${targets.length} of the same size
      <div class="ev">a duplicate takes one of them: the object in that slot stops existing</div></span></div>
    <div style="padding:0 12px"><select id="dup-target" style="width:100%;background:#0d1218;border:1px solid var(--line);color:var(--text);border-radius:3px;padding:4px">${options}</select>
      <div style="display:flex;gap:6px;margin:6px 0"><button id="dup-prepare">Prepare</button><button id="dup-confirm" disabled>Confirm</button></div>
      <div id="dup-plan"></div></div>`;
}

// What the prepared plan actually does, in the order that matters: what breaks, then what changes, then the
// bytes. A blocking rule offers no confirmation at all; a critical one needs its own acknowledgement.
export function renderDuplicatePlan(prepared) {
  if (!prepared) return '';
  if (prepared.error)
    return `<div class="rule blocking"><span class="id">refused</span> ${esc(prepared.error)}<div class="why">${esc(prepared.reason ?? '')}</div></div>`;
  const plan = prepared.plan ?? {};
  const rules = prepared.rules ?? plan.safety ?? [];
  const shared = (plan.shared_records ?? []).filter(r => r.bytes_changed);
  const critical = rules.filter(r => r.severity === 'critical');
  const blocking = rules.filter(r => r.severity === 'blocking');
  return [
    `<div class="ev" style="margin-top:6px">recipe ${esc(plan.recipe ?? 'unknown')}, ${(plan.changes ?? []).length} field edits, file length unchanged</div>`,
    shared.length
      ? `<h2>What else this rewrites</h2>` +
        shared
          .map(
            r => `<div class="rule ${r.external_users > 0 ? 'critical' : ''}">
          <span class="id">${r.external_users > 0 ? r.external_users + ' other record(s) point at this' : 'used by nothing outside'}</span>
          <div class="why">0x${r.offset.toString(16)}${r.name_before ? ' — ' + esc(String(r.name_before).replace(/^.*[\\/]/, '')) : ''}${r.name_before !== r.name_after ? ' becomes ' + esc(String(r.name_after).replace(/^.*[\\/]/, '')) : ''}</div></div>`,
          )
          .join('')
      : '<div class="ev" style="margin-top:6px">no record outside the slot is rewritten</div>',
    rules.length ? `<h2>Safety</h2>` + rules.map(renderRule).join('') : '',
    blocking.length
      ? '<div class="ev">this cannot be confirmed: a blocking rule means the file would not load</div>'
      : critical.length
        ? `<label class="ev" style="display:block;margin:8px 0"><input type="checkbox" id="dup-ack"> I accept that ${critical.map(r => esc(shortConsequence(r))).join('; and that ')}</label>`
        : '<div class="ev" style="margin-top:6px">no critical consequence; confirm when ready</div>',
  ].join('');
}

// The consequence in the acknowledgement is the rule's own words, not a generic "I understand the risk".
function shortConsequence(rule) {
  const m = /holds (the [^,]+), used by (\d+) placements/.exec(rule.message ?? '');
  if (m) return `${m[1]} is rewritten for all ${m[2]} placements that use it`;
  return (rule.message ?? rule.id).replace(/\s+/g, ' ').slice(0, 160);
}
