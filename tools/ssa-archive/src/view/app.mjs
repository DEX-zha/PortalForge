// View wiring (feature 003 T023): fetch the session, build the scene, drive the layer list and route selection
// into the inspector. Every decision that can be made without a screen lives in layers.mjs, select.mjs and
// coords.mjs, which are unit tested; this file only connects them to the DOM and to the API.
import { createScene } from './scene.mjs';
import { layerIndex, showAll, hideAll, toggle, visibleSet } from './layers.mjs';
import { orderHits, pickNext } from './select.mjs';
import { renderPlacement, renderGrades } from './inspector.mjs';
import { HANDEDNESS } from './coords.mjs';

const $ = id => document.getElementById(id);
const api = async path => {
  const r = await fetch(path);
  const body = await r.json().catch(() => ({ error: 'BAD_RESPONSE', reason: r.statusText }));
  if (!r.ok) throw new Error(`${body.error}: ${body.reason}`);
  return body;
};

const fail = message => { const box = $('error'); box.hidden = false; box.textContent = message; };

const state = { placements: [], layers: [], visible: new Set(), selection: null, scene: null };

async function main() {
  let session, data;
  try {
    session = await api('/api/session');
    data = await api('/api/placements');
  } catch (e) { return fail(`The editor could not open this level. ${e.message}`); }

  state.placements = data.placements;
  state.layers = data.layers;

  $('file').textContent = session.file.replace(/^.*[\\/]/, '');
  $('counts').textContent = `${session.placement_count} placements · ${session.counts.direct} with a model · `
    + `${session.counts.absent} markers · class type ${session.detection.placement_type}`;
  $('evidence-note').textContent = session.has_runtime_map
    ? 'runtime map loaded'
    : 'no runtime map: every pointer-derived value is structural';

  if (!state.placements.length) return fail('This file carries no placements, so there is nothing to show.');
  if (!HANDEDNESS.verified) {
    $('hint').textContent += ' · axis handedness UNVERIFIED (quickstart scenario 2)';
  }

  // Grade every placement once, so the scene can colour by risk and the layer bars can show where it sits.
  const grades = new Map();
  for (const p of state.placements) grades.set(p.offset, gradeOf(p));

  state.scene = createScene($('c'));
  state.scene.build(state.placements, grades);

  const index = layerIndex(state.placements);
  state.visible = showAll(index);
  renderLayers(index);
  state.scene.setVisible(visibleSet(state.placements, state.visible));

  $('c').addEventListener('pointerdown', onPick);
  $('frame-all').addEventListener('click', () => state.scene.frameAll());
  $('frame-sel').addEventListener('click', () => state.scene.frameSelection());
  $('all-on').addEventListener('click', () => { state.visible = showAll(index); renderLayers(index); apply(); });
  $('all-off').addEventListener('click', () => { state.visible = hideAll(); renderLayers(index); apply(); });
  window.addEventListener('keydown', e => {
    if (e.key === 'f') state.scene.frameSelection();
    if (e.key === 'F') state.scene.frameAll();
    if (e.key === 't') state.scene.topDown();          // quickstart scenario 2
  });
}

// The worst severity the layer bars and the proxy colours use. The rules themselves come from the API per
// placement; this is the cheap local grading that only needs the record.
function gradeOf(p) {
  if (p.behavior && /PushBlock/i.test(p.behavior.path ?? '')) return 'critical';
  if (p.model.status === 'ambiguous') return 'high';
  if (p.behavior) return 'medium';
  return 'info';
}

function apply() { state.scene.setVisible(visibleSet(state.placements, state.visible)); }

function renderLayers(index) {
  const byName = new Map(state.layers.map(l => [l.name, l]));
  $('layers').innerHTML = index.map(l => {
    const meta = byName.get(l.name);
    return `<label class="layer"><input type="checkbox" data-layer="${l.name.replace(/"/g, '&quot;')}"
        ${state.visible.has(l.name) ? 'checked' : ''}>
        <span class="n" title="${l.name.replace(/"/g, '&quot;')}">${l.name.replace(/</g, '&lt;')}</span>
        <span class="c">${l.count}</span></label>`
      + (meta ? renderGrades(meta.grades) : '');
  }).join('');
  for (const box of $('layers').querySelectorAll('input[data-layer]')) {
    box.addEventListener('change', () => { state.visible = toggle(state.visible, box.dataset.layer); apply(); });
  }
}

async function onPick(ev) {
  if (ev.button !== 0) return;
  const hits = orderHits(state.scene.hitsAt(ev.clientX, ev.clientY));
  const next = pickNext({ hits, pointer: { x: ev.clientX, y: ev.clientY }, previous: state.selection });
  state.selection = next;
  state.scene.select(next ? next.offset : null);
  if (!next) { $('inspector').innerHTML = renderPlacement(null); return; }
  try {
    const b = await api(`/api/placement/${next.offset}`);
    $('inspector').innerHTML = renderPlacement(b.placement, b.safety, b.replace_targets)
      + (next.total > 1 ? `<div class="ev" style="padding:0 12px 12px">${next.index + 1} of ${next.total} under the cursor; click again to reach the next</div>` : '');
  } catch (e) { $('inspector').innerHTML = `<div class="empty">${e.message}</div>`; }
}

main();
