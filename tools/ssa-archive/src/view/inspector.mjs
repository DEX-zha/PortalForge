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

export function renderPlacement(p, safety = [], targets = []) {
  if (!p) return '<div class="empty">Nothing selected. Click a proxy in the view.</div>';
  const model = p.model.path
    ? `${esc(base(p.model.path))}<div class="ev">${esc(p.model.path)}</div>`
    : `<span class="k">none: this is a marker, not a visible prop</span>`;
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
    row('layers', p.layers.length ? esc(p.layers.join(', ')) : '<span class="k">(unlayered)</span>', p.evidence.layers),
    row('shared state', shared),
    row('resolution', esc(p.model.status) + (p.model.field !== null ? ` <span class="k">via +${hex(p.model.field)}</span>` : '')),
    p.model_candidates.length > 1
      ? row('candidates', p.model_candidates.map(c => esc(base(c.path)) + ' <span class="k">+' + hex(c.field) + '</span>').join('<br>'))
      : '',
    `<h2>Safety</h2>`,
    safety.length ? safety.map(renderRule).join('') : '<div class="empty">no rule triggered</div>',
    `<h2>Duplication</h2>`,
    targets.length
      ? `<div class="row"><span class="k">same-size slots</span><span class="v">${targets.length} candidate${targets.length > 1 ? 's' : ''}<div class="ev">a duplicate consumes one of them; editing arrives with User Story 3</div></span></div>`
      : '<div class="empty">no slot of this size to sacrifice</div>',
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
