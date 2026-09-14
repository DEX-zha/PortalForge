// The inspector: the frozen placement record, the evidence behind each attribute, and the safety rules that
// apply to it (feature 003 T021, T022).
//
// The evidence is not decoration. The project's first principle is that a capability exists only when runtime
// evidence shows it, so an attribute the game itself rewrote at load and an attribute inferred from the file
// structure must not look the same. `runtime-pointer` is marked; everything else reads as structural.

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = n => '0x' + Number(n).toString(16).toUpperCase();
const base = p => (p ? String(p).replace(/^.*[\\/]/, '') : null);

const EVIDENCE_TEXT = {
  'runtime-pointer': 'runtime: the game rewrote this word at load',
  'structural': 'structural: read from the file, not confirmed at runtime',
  'structural-only': 'structural only: the runtime map does not confirm this pointer',
  'none': null,
};

function row(key, value, evidence) {
  const ev = evidence && EVIDENCE_TEXT[evidence]
    ? `<div class="ev ${evidence === 'runtime-pointer' ? 'runtime' : ''}">${esc(EVIDENCE_TEXT[evidence])}</div>` : '';
  return `<div class="row"><span class="k">${esc(key)}</span><span class="v">${value}${ev}</span></div>`;
}

export function renderPlacement(p, safety = [], targets = [], { hasRuntimeMap = true, script = null } = {}) {
  if (!p) return '<div class="empty">Nothing selected. Click a proxy in the view.</div>';
  const model = p.model.path
    ? `${esc(base(p.model.path))}<div class="ev">${esc(p.model.path)}</div>`
    : `<span class="k">Aucun modèle direct ; peut être un repère ou un générateur d’objets.</span>`;
  const behaviour = p.behavior
    ? `${esc(base(p.behavior.path))}<div class="ev">${esc(p.behavior.path)}</div>`
    : '<span class="k">none</span>';
  const shared = p.shared_state
    ? (p.shared_state.shared
      ? `${p.shared_state.users} placements use this model record${p.shared_state.rewritten_by_replacing !== null
        ? `<div class="ev">its bytes live inside ${hex(p.shared_state.rewritten_by_replacing)}, so replacing that blob retextures all of them</div>` : ''}`
      : 'used by this placement only')
    : '<span class="k">no model record</span>';

  return [
    `<div class="row"><span class="k">name</span><span class="v"><b>${esc(p.name ?? '(unnamed)')}</b></span></div>`,
    row('offset', `${hex(p.offset)}<div class="ev">slot ${hex(p.span)} bytes</div>`),
    // Typed entry and the gizmos produce the same intent, so a value can be read off a report and entered exactly.
    row('position', [0, 1, 2].map(i => `<input class="num" data-edit="position" data-axis="${i}" value="${p.position[i]}">`).join(' ')),
    row('heading', `<input class="num" data-edit="heading" value="${p.rotation.heading}"> &deg;`),
    row('scale', `<input class="num" data-edit="scale" value="${p.scale}"> <span class="k">(100 = 1.0)</span>`),
    row('model', model, p.evidence.model),
    row('behaviour', behaviour, p.evidence.behavior),
    script?.clones?.length ? row('Objets créés par script', script.clones.map(c => `${esc(c.name)}<div class="ev">${esc(base(c.model) ?? 'sans modèle direct')}</div>`).join('<br>')
      + '<div class="rule medium">Les aperçus de ponts et canons représentent leur pose initiale. Les animations et changements pendant le jeu ne sont pas simulés.</div>') : '',
    script?.scene_role ? '<div class="rule medium">Modèle ou objet initialement désactivé : cette position peut être un emplacement de stockage, sans sol associé.</div>'
      + (script.scene_role.counterparts ?? []).map(c => `<button data-counterpart="${c.offset}">Voir ${esc(c.name)} dans le niveau</button>`).join('') : '',
    script?.template_for?.length ? '<div class="rule medium">Objet utilisé comme modèle par '
      + script.template_for.map(s => esc(base(s.path))).join(', ')
      + '. Les copies créées en jeu peuvent apparaître ailleurs que la position enregistrée ici.</div>' : '',
    script?.trajectory?.supported ? `<div class="rule info">Le déplacement translate aussi les ${script.trajectory.points.length} points de trajectoire de cet objet. Son animation est conservée.</div>`
      : script?.animated ? '<div class="rule medium">Ce script contient des déplacements ou animations. Une position enregistrée peut ensuite être recalculée pendant le jeu.</div>' : '',
    row('layers', p.layers.length ? esc(p.layers.join(', ')) : '<span class="k">(unlayered)</span>', p.evidence.layers),
    row('shared state', shared),
    row('resolution', esc(p.model.status) + (p.model.field !== null ? ` <span class="k">via +${hex(p.model.field)}</span>` : '')),
    p.model_candidates.length > 1
      ? row('candidates', p.model_candidates.map(c => esc(base(c.path)) + ' <span class="k">+' + hex(c.field) + '</span>').join('<br>'))
      : '',
    `<h2>Safety</h2>`,
    safety.length ? safety.map(renderRule).join('') : '<div class="empty">no rule triggered</div>',
    `<h2>Duplication</h2>`,
    renderDuplicate(p, targets, hasRuntimeMap),
    `<h2>Layout evidence</h2>`,
    `<div class="ev" style="padding:0 12px 12px">${esc(p.evidence.layout)}</div>`,
  ].join('');
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
  return `<div class="bar">${order.map(k => {
    const n = grades[k] ?? 0;
    return n ? `<i style="width:${(100 * n / total).toFixed(1)}%;background:var(--${k === 'blocking' ? 'critical' : k === 'info' ? 'static' : k})" title="${k}: ${n}"></i>` : '';
  }).join('')}</div>`;
}

// A duplication consumes a slot: the object that was there stops existing. So the panel names the candidates and
// what each one costs, and nothing is confirmable until the plan has been prepared and read.
export function renderDuplicate(p, targets = [], hasRuntimeMap = true) {
  // Reading a level structurally is enough to move an object; rewriting its pointer fields is not. Saying so here
  // is the difference between a disabled control and an unexplained one.
  if (!hasRuntimeMap) return '<div class="empty">duplication is unavailable on this level: it has no runtime fixup map, so which words are pointers is structural only. Moving, turning and scaling stay available. Produce a map with <code>experiment ptr-scan</code> to duplicate here.</div>';
  if (!targets.length) return '<div class="empty">no slot of this size to sacrifice, so this object cannot be duplicated</div>';
  const options = targets.slice(0, 200).map(t =>
    `<option value="${t.offset}">${esc(t.name ?? hex(t.offset))}${t.layers?.length ? ' — ' + esc(t.layers.join(', ')) : ''}</option>`).join('');
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
  if (prepared.error) return `<div class="rule blocking"><span class="id">refused</span> ${esc(prepared.error)}<div class="why">${esc(prepared.reason ?? '')}</div></div>`;
  const plan = prepared.plan ?? {};
  const rules = prepared.rules ?? plan.safety ?? [];
  const shared = (plan.shared_records ?? []).filter(r => r.bytes_changed);
  const critical = rules.filter(r => r.severity === 'critical');
  const blocking = rules.filter(r => r.severity === 'blocking');
  return [
    `<div class="ev" style="margin-top:6px">recipe ${esc(plan.recipe ?? 'unknown')}, ${(plan.changes ?? []).length} field edits, file length unchanged</div>`,
    shared.length
      ? `<h2>What else this rewrites</h2>` + shared.map(r => `<div class="rule ${r.external_users > 0 ? 'critical' : ''}">
          <span class="id">${r.external_users > 0 ? r.external_users + ' other record(s) point at this' : 'used by nothing outside'}</span>
          <div class="why">0x${r.offset.toString(16)}${r.name_before ? ' — ' + esc(String(r.name_before).replace(/^.*[\\/]/, '')) : ''}${r.name_before !== r.name_after ? ' becomes ' + esc(String(r.name_after).replace(/^.*[\\/]/, '')) : ''}</div></div>`).join('')
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
