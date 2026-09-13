// View wiring (feature 003 T023): fetch the session, build the scene, drive the layer list and route selection
// into the inspector. Every decision that can be made without a screen lives in layers.mjs, select.mjs and
// coords.mjs, which are unit tested; this file only connects them to the DOM and to the API.
import { createScene } from './scene.mjs';
import { layerIndex, showAll, hideAll, toggle, visibleSet } from './layers.mjs';
import { orderHits, pickNext } from './select.mjs';
import { renderPlacement, renderGrades, renderDuplicatePlan } from './inspector.mjs';
import { HANDEDNESS } from './coords.mjs';
import { gradeOf } from './framing.mjs';   // one definition of what each colour means, shared with edit preview

const $ = id => document.getElementById(id);
const api = async (path, body) => {
  const r = body === undefined ? await fetch(path)
    : await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await r.json().catch(() => ({ error: 'BAD_RESPONSE', reason: r.statusText }));
  if (!r.ok) throw new Error(payload.reason ?? payload.error ?? r.statusText);
  return payload;
};

const fail = message => { const box = $('error'); box.hidden = false; box.textContent = message; };

const state = { placements: [], layers: [], visible: new Set(), selection: null, scene: null, mode: null, dirty: false, undoDepth: 0, redoDepth: 0, saved: null, patched: null };

async function main() {
  let session, data;
  try {
    session = await api('/api/session');
    data = await api('/api/placements');
  } catch (e) { return fail(`The editor could not open this level. ${e.message}`); }

  state.hasRuntimeMap = session.has_runtime_map;
  state.placements = data.placements;
  state.layers = data.layers;

  $('file').textContent = session.file.replace(/^.*[\\/]/, '');
  // A tally rather than a run-on meta line: these are four different measurements, not one sentence.
  $('tally').innerHTML = [
    [session.placement_count, 'placed'],
    [session.counts.direct, 'with a model'],
    [session.counts.absent, 'markers'],
    [session.layer_count, 'layers'],
  ].map(([n, label]) => `<span><b>${n}</b> ${label}</span>`).join('')
    + `<span title="detected from the record layout, not assumed">class ${session.detection.placement_type}</span>`;
  $('evidence-note').textContent = session.has_runtime_map
    ? 'runtime map loaded'
    : 'no runtime map: every pointer-derived value is structural';

  if (!state.placements.length) return fail('This file carries no placements, so there is nothing to show.');
  if (!HANDEDNESS.verified) {
    $('hint').textContent += ' Axis handedness is unverified: see quickstart scenario 2.';
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

  showDiagnostics();
  $('c').addEventListener('pointerdown', onPick);
  $('frame-all').addEventListener('click', () => state.scene.frameAll());
  $('frame-sel').addEventListener('click', () => state.scene.frameSelection());
  $('all-on').addEventListener('click', () => { state.visible = showAll(index); renderLayers(index); apply(); });
  $('all-off').addEventListener('click', () => { state.visible = hideAll(); renderLayers(index); apply(); });

  // Gizmos and typed entry produce the SAME intent, so the two ways of editing cannot drift apart (T034 to T036).
  for (const [id, mode] of [['gizmo-move', 'translate'], ['gizmo-rotate', 'rotate'], ['gizmo-scale', 'scale'], ['gizmo-off', null]]) {
    $(id).addEventListener('click', () => setMode(mode));
  }
  state.scene.onGizmo({
    live: v => updateFields(v),
    commit: async v => {
      if (!state.selection) return;
      const intent = { kind: 'transform', target: state.selection.offset };
      if (state.mode === 'translate') intent.position = v.position;
      if (state.mode === 'rotate') intent.heading = v.heading;
      if (state.mode === 'scale') intent.scale = v.scale;
      await sendIntent(intent);
    },
  });
  $('undo').addEventListener('click', () => sendPost('/api/undo'));
  $('redo').addEventListener('click', () => sendPost('/api/redo'));
  $('save').addEventListener('click', doSave);
  $('do-patch').addEventListener('click', doPatch);
  $('do-launch').addEventListener('click', doLaunch);
  $('prediction').addEventListener('input', refreshSaveState);
  $('inspector').addEventListener('change', onTyped);
  $('inspector').addEventListener('click', onDuplicateClick);
  refreshSaveState();

  window.addEventListener('keydown', e => {
    if (e.key === 'f') state.scene.frameSelection();
    if (e.key === 'F') state.scene.frameAll();
    if (e.key === 't') state.scene.topDown();          // quickstart scenario 2
    if (e.key === 'w') setMode('translate');
    if (e.key === 'e') setMode('rotate');
    if (e.key === 'r') setMode('scale');
    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendPost(e.shiftKey ? '/api/redo' : '/api/undo'); }
  });
}


// On screen rather than in a console: if the view is empty, this says whether the proxies exist, whether the
// canvas has a size, and where the camera is pointing.
function showDiagnostics() {
  const tick = () => {
    const d = state.scene.diagnostics();
    $('diag').textContent = [
      d.proxies + ' proxies (' + d.boxes + ' boxes, ' + d.markers + ' markers)',
      'canvas ' + d.canvas.w + '×' + d.canvas.h + ', buffer ' + d.pixels + 'px',
      'proxy ' + d.proxy + ' units',
      d.bounds ? 'level ' + d.bounds.min.join(',') + ' to ' + d.bounds.max.join(',') : 'no bounds',
      'camera ' + d.camera.join(',') + ' looking at ' + d.target.join(','),
    ].join(String.fromCharCode(10));
    setTimeout(tick, 1000);
  };
  tick();
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
  if (state.mode) state.scene.setGizmoMode(state.mode);
  if (!next) { $('inspector').innerHTML = renderPlacement(null); return; }
  try {
    const b = await api(`/api/placement/${next.offset}`);
    $('inspector').innerHTML = renderPlacement(b.placement, b.safety, b.replace_targets, { hasRuntimeMap: state.hasRuntimeMap })
      + (next.total > 1 ? `<div class="ev" style="padding:0 12px 12px">${next.index + 1} of ${next.total} under the cursor; click again to reach the next</div>` : '');
  } catch (e) { $('inspector').innerHTML = `<div class="empty">${e.message}</div>`; }
}


// ---------------------------------------------------------------------------------------------------------
// Editing (T036 to T038). Every change goes to the editor process as an intent; the view holds no bytes and
// applies nothing locally, so what is drawn is always what the session actually contains.

function setMode(mode) {
  state.mode = mode;
  for (const [id, m] of [['gizmo-move', 'translate'], ['gizmo-rotate', 'rotate'], ['gizmo-scale', 'scale'], ['gizmo-off', null]]) {
    $(id).classList.toggle('on', state.mode === m);
  }
  state.scene.setGizmoMode(mode);
}

function updateFields(v) {
  const set = (sel, value) => { const el = document.querySelector(sel); if (el && document.activeElement !== el) el.value = value; };
  if (v.position) [0, 1, 2].forEach(i => set('[data-edit="position"][data-axis="' + i + '"]', v.position[i]));
  set('[data-edit="heading"]', v.heading);
  set('[data-edit="scale"]', v.scale);
}

async function onTyped(ev) {
  const el = ev.target.closest('[data-edit]');
  if (!el || !state.selection) return;
  const attribute = el.dataset.edit;
  const intent = { kind: 'transform', target: state.selection.offset };
  if (attribute === 'position') {
    intent.position = [0, 1, 2].map(i => Number(document.querySelector('[data-edit="position"][data-axis="' + i + '"]').value));
    if (intent.position.some(n => !Number.isFinite(n))) return note('a position needs three numbers');
  } else {
    const n = Number(el.value);
    if (!Number.isFinite(n)) return note(attribute + ' needs a number');
    intent[attribute] = n;
  }
  await sendIntent(intent);
}

async function sendIntent(intent) {
  if (!intent.target) return;
  try { afterChange(await api('/api/edit', intent)); }
  catch (e) { note(e.message); await reselect(); }
}

async function sendPost(path) {
  try { afterChange(await api(path, {})); } catch (e) { note(e.message); }
}

// The session is the truth: redraw the edited proxy from what came back, never from what was dragged.
function afterChange(b) {
  const p = b.placement;
  if (p) {
    const local = state.placements.find(x => x.offset === p.offset);
    if (local) { local.position = p.position; local.rotation = p.rotation; local.scale = p.scale; }
    state.scene.refresh(p.offset);
    state.scene.select(p.offset);
    if (state.mode) state.scene.setGizmoMode(state.mode);
    updateFields({ position: p.position, heading: p.rotation.heading, scale: p.scale });
  }
  state.dirty = b.dirty;
  state.undoDepth = b.undo_depth ?? state.undoDepth;
  state.redoDepth = b.redo_depth ?? state.redoDepth;
  refreshSaveState();
}

async function reselect() {
  if (!state.selection) return;
  const b = await api('/api/placement/' + state.selection.offset);
  $('inspector').innerHTML = renderPlacement(b.placement, b.safety, b.replace_targets, { hasRuntimeMap: state.hasRuntimeMap });
}

const note = msg => { $('save-note').textContent = msg; };

function refreshSaveState() {
  $('dirty').textContent = state.dirty ? state.undoDepth + ' unsaved edit' + (state.undoDepth > 1 ? 's' : '') : '';
  $('dirty').classList.toggle('on', !!state.dirty);
  $('save').disabled = !state.dirty;
  $('do-patch').disabled = !state.saved;
  $('do-launch').disabled = !state.patched || !$('prediction').value.trim();
  $('save-state').textContent = state.dirty ? 'unsaved changes'
    : state.patched ? 'patched, ready to launch' : state.saved ? 'saved, not patched' : 'no edit yet';
}

async function doSave() {
  try {
    const b = await api('/api/save', {});
    state.saved = b.written; state.patched = null; state.dirty = b.dirty;
    note('Written to ' + b.written + '. ' + b.plan.changes.length + ' field' + (b.plan.changes.length === 1 ? '' : 's') + ' changed, nothing outside them.');
  } catch (e) { state.saved = null; note('refused: ' + e.message); }
  refreshSaveState();
}

async function doPatch() {
  try { const b = await api('/api/patch', {}); state.patched = b.patch.dir; note('patch built in ' + b.patch.dir); }
  catch (e) { note('refused: ' + e.message); }
  refreshSaveState();
}

async function doLaunch() {
  const prediction = $('prediction').value.trim();
  if (!prediction) return note('state what should be visible before launching: an experiment without a prediction cannot be judged');
  try {
    await api('/api/launch', { prediction });
    note('the game is starting; this window does not wait for it');
    pollLaunch();
  } catch (e) { note('refused: ' + e.message); }
  refreshSaveState();
}

// The run is polled, never awaited: a boot outlasts any request. The lock stays held until an observation.
async function pollLaunch() {
  const started = Date.now();
  const tick = async () => {
    let b;
    try { b = await api('/api/launch'); } catch { return; }
    if (b.launch?.running) {
      note('running for ' + Math.round((Date.now() - started) / 1000) + 's; the patch is locked while it reads');
      return setTimeout(tick, 5000);
    }
    note(b.launch?.error ? 'the run failed: ' + b.launch.error
      : 'run ' + b.launch?.experiment_id + ' finished; record what you saw to release the lock');
    refreshSaveState();
  };
  tick();
}

main();

// ---------------------------------------------------------------------------------------------------------
// Duplication (T046 to T048). Two steps on purpose: prepare shows what the operation would do, confirm applies
// it. The confirm button stays disabled until a plan has been prepared and, when a critical rule is triggered,
// until it has been acknowledged by name.

let prepared = null;

async function onDuplicateClick(ev) {
  const id = ev.target?.id;
  if (id === 'dup-prepare') return prepareDuplicate();
  if (id === 'dup-confirm') return confirmDuplicate();
  if (id === 'dup-ack') { $('dup-confirm').disabled = !ev.target.checked; }
}

// Prepare asks the editor for the plan WITHOUT acknowledging anything, so the refusal comes back carrying the
// rules that caused it. That refusal is the panel's content: it is what the researcher has to read.
async function prepareDuplicate() {
  const target = Number($('dup-target').value);
  if (!state.selection || !target) return;
  const intent = { kind: 'replace', target, source: state.selection.offset, dry_run: true };
  try {
    const b = await api('/api/duplicate/plan', intent);
    prepared = b;
  } catch (e) {
    prepared = { error: e.error ?? 'REFUSED', reason: e.message, rules: e.rules ?? [] };
  }
  $('dup-plan').innerHTML = renderDuplicatePlan(prepared);
  const blocking = (prepared.rules ?? prepared.plan?.safety ?? []).some(r => r.severity === 'blocking');
  const critical = (prepared.rules ?? prepared.plan?.safety ?? []).some(r => r.severity === 'critical');
  $('dup-confirm').disabled = blocking || critical || !!prepared.error;
}

async function confirmDuplicate() {
  const target = Number($('dup-target').value);
  const rules = prepared?.rules ?? prepared?.plan?.safety ?? [];
  const acknowledged = rules.filter(r => r.severity === 'critical').map(r => r.id);
  try {
    const b = await api('/api/edit', { kind: 'replace', target, source: state.selection.offset, acknowledged });
    prepared = null;
    afterChange(b);
    await reselect();
    note('duplicated into 0x' + target.toString(16) + '; save to write it');
  } catch (e) { note('refused: ' + e.message); }
}
