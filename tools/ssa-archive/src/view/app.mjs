// View wiring (feature 003 T023): fetch the session, build the scene, drive the layer list and route selection
// into the inspector. Every decision that can be made without a screen lives in layers.mjs, select.mjs and
// coords.mjs, which are unit tested; this file only connects them to the DOM and to the API.
import { createScene } from './scene.mjs';
import { layerIndex, showAll, hideAll, toggle, visibleSet } from './layers.mjs';
import { orderHits, pickNext, shouldPick, commitTarget } from './select.mjs';
import { isBound } from './navigate.mjs';
import { renderPlacement, renderGrades, renderDuplicatePlan } from './inspector.mjs';
import { HANDEDNESS } from './coords.mjs';
import { gradeOf, levelExtent } from './framing.mjs'; // one definition of what each colour means, shared with edit preview
import { decodeMeshPayload } from './mesh-data.mjs';
import { bindCatalog } from './catalog.mjs';
import { bindWorkspace } from './workspace.mjs';
import { bindLevels } from './levels.mjs';

const $ = id => document.getElementById(id);
const SKIP_INTRO_KEY = 'portalforge.skipOpeningCinematic';
const api = async (path, body) => {
  const r =
    body === undefined
      ? await fetch(path)
      : await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
  const payload = await r.json().catch(() => ({ error: 'BAD_RESPONSE', reason: r.statusText }));
  if (!r.ok) throw new Error(payload.reason ?? payload.error ?? r.statusText);
  return payload;
};

const fail = message => {
  const box = $('error');
  box.hidden = false;
  box.innerHTML = '<div><b>The editor cannot show this level.</b>' + message.replace(/</g, '&lt;') + '</div>';
  shown = true;
};

const state = {
  placements: [],
  layers: [],
  visible: new Set(),
  selection: null,
  scene: null,
  mode: null,
  dirty: false,
  undoDepth: 0,
  redoDepth: 0,
  saved: null,
  patched: null,
};

async function main() {
  bindWorkspace();
  let session, data;
  try {
    session = await api('/api/session');
    data = await api('/api/placements');
  } catch (e) {
    return fail(`The editor could not open this level. ${e.message}`);
  }

  state.hasRuntimeMap = session.has_runtime_map;
  state.dirty = session.dirty;
  state.undoDepth = session.undo_depth ?? 0;
  state.redoDepth = session.redo_depth ?? 0;
  state.saved = session.saved;
  state.patched = session.patched;
  state.running = session.launch_running;
  state.locked = session.locked;
  state.tutorial = session.archive?.toLowerCase() === 'level/level_027_tutorial.bld';
  try {
    $('skip-intro').checked = localStorage.getItem(SKIP_INTRO_KEY) === 'true';
  } catch {
    /* Preference storage may be disabled. */
  }
  $('skip-intro').addEventListener('change', () => {
    try {
      localStorage.setItem(SKIP_INTRO_KEY, String($('skip-intro').checked));
    } catch {
      /* Keep the current choice for this page. */
    }
  });
  $('launch-mode').addEventListener('change', refreshSaveState);
  $('launch-mode').value = state.tutorial ? 'test' : 'play';
  if (!state.tutorial) $('launch-mode').querySelector('[value="test"]').disabled = true;
  try {
    const entry = await api('/api/level-entry');
    const redirect = !state.tutorial && !!entry.redirect?.available;
    const directOptions = $('launch-mode').querySelectorAll('[value^="direct-"]');
    for (const option of directOptions) option.disabled = !(entry.supported || redirect);
    if (entry.supported) {
      $('launch-mode').value = 'direct-test';
      $('entry-note').textContent =
        'Direct entry skips the menus after one preparation run. A changed disc layout requires preparation again. Your current patch is loaded each time.';
    } else if (redirect) {
      // Feature 006: the level is served under the tutorial's file names, so the tutorial checkpoint loads it.
      const confidence = entry.redirect.confidence ?? 'UNKNOWN';
      const suffix = confidence === 'CONFIRMED' ? '' : confidence === 'LIKELY' ? ' (likely)' : ' (experimental)';
      for (const option of directOptions)
        option.textContent =
          (option.value === 'direct-play'
            ? 'Direct level play via the tutorial slot'
            : 'Direct level test via the tutorial slot') + suffix;
      $('launch-mode').value = 'direct-play';
      $('entry-note').textContent = confidence + ': ' + entry.redirect.why + '.';
    } else if (entry.redirect) {
      $('entry-note').textContent = 'Direct entry unavailable: ' + entry.redirect.why + '.';
    }
  } catch {
    /* Existing launch modes remain available. */
  }
  state.placements = data.placements;
  state.layers = data.layers;

  // Real geometry (feature 004). A level without it still opens: every placement falls back to its proxy.
  let meshes = new Map(),
    scenery = null,
    meshStats = null,
    scripted = [];
  try {
    const m = await api('/api/meshes'),
      decoded = decodeMeshPayload(m);
    meshes = decoded.models;
    scenery = decoded.scenery;
    meshStats = m.stats;
    scripted = m.scripted_previews ?? [];
    state.resources = new Set((m.scene_roles ?? []).map(r => r.offset));
  } catch (e) {
    note('meshes unavailable: ' + e.message);
  }

  $('file').textContent = session.file.replace(/^.*[\\/]/, '');
  // The Level tab and the header picker (feature 006): every level of the disc, and what this one can do.
  state.levels = bindLevels({ api, note, busy: () => state.busy || state.running || state.locked });
  await state.levels.reload();
  // Objects the level parks far away (boss cameras, template spawners) are drawn but left out of the framing.
  const parked = levelExtent(state.placements.map(p => p.position)).parked;
  const parkedNames = parked
    .slice(0, 6)
    .map(i => state.placements[i].name)
    .join(', ');
  // A tally rather than a run-on meta line: these are four different measurements, not one sentence.
  $('tally').innerHTML =
    [
      [session.placement_count, 'placed'],
      [session.counts.direct, 'with a model'],
      [meshStats ? meshStats.with_mesh : 0, 'meshed models'],
      [session.counts.absent, 'markers'],
      [session.layer_count, 'layers'],
      ...(parked.length ? [[parked.length, 'parked far away', parkedNames]] : []),
    ]
      .map(
        ([n, label, title]) =>
          `<span${title ? ` title="${title.replace(/"/g, '&quot;')}"` : ''}><b>${n}</b> ${label}</span>`,
      )
      .join('') +
    `<span title="detected from the record layout, not assumed">class ${session.detection.placement_type}</span>`;
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
  state.scene.build(state.placements, grades, meshes, scenery);
  state.scene.setScriptedPreviews(scripted, meshes);
  $('scripted-layer').hidden = !scripted.length;
  $('scripted-visible').addEventListener('change', () => state.scene.setScriptedVisible($('scripted-visible').checked));
  $('resources-layer').hidden = !state.resources?.size;
  $('resources-count').textContent = state.resources?.size ?? 0;
  $('resources-visible').addEventListener('change', apply);
  $('scenery-layer').hidden = !scenery?.units;
  $('scenery-count').textContent = scenery?.units ?? 0;
  $('scenery-visible').checked = true;
  $('scenery-visible').addEventListener('change', () => state.scene.setSceneryVisible($('scenery-visible').checked));
  $('large-surfaces-solid').addEventListener('change', () =>
    state.scene.setLargeSurfacesSolid($('large-surfaces-solid').checked),
  );
  // The game-time view (feature 006): the newest snapshot read from Dolphin for this level, if any.
  state.meshes = meshes;
  await loadSnapshot();
  $('snapshot-visible').addEventListener('change', applySnapshot);
  $('snapshot-capture').addEventListener('click', captureSnapshot);
  $('mesh-coverage').textContent = meshStats
    ? `${meshStats.draw_units}/${meshStats.descriptors} geometry blocks decoded · ${meshStats.assigned_unique ?? '?'} in models · ${meshStats.scenery ?? 0} scenery · ${meshStats.unresolved ?? meshStats.world ?? 0} unresolved` +
      (meshStats.stop ? ` · Incomplete: ${meshStats.stop.why}` : '')
    : 'Geometry unavailable; showing placement markers.';

  const index = layerIndex(state.placements);
  state.visible = showAll(index);
  state.layerIndex = index;
  renderLayers(index);
  apply();

  showDiagnostics();
  $('c').addEventListener('pointerdown', onPick);
  $('frame-all').addEventListener('click', () => state.scene.frameAll());
  $('frame-sel').addEventListener('click', () => state.scene.frameSelection());
  $('wireframe').addEventListener('click', () => toggleWireframe());
  $('all-on').addEventListener('click', () => {
    state.visible = showAll(state.layerIndex);
    renderLayers(state.layerIndex);
    apply();
    $('scenery-visible').checked = true;
    state.scene.setSceneryVisible(true);
  });
  $('all-off').addEventListener('click', () => {
    state.visible = hideAll();
    renderLayers(state.layerIndex);
    apply();
    $('scenery-visible').checked = false;
    state.scene.setSceneryVisible(false);
  });

  // Gizmos and typed entry produce the SAME intent, so the two ways of editing cannot drift apart (T034 to T036).
  for (const [id, mode] of [
    ['gizmo-move', 'translate'],
    ['gizmo-rotate', 'rotate'],
    ['gizmo-scale', 'scale'],
    ['gizmo-off', null],
  ]) {
    $(id).addEventListener('click', () => setMode(mode));
  }
  state.scene.onGizmo({
    live: v => updateFields(v),
    commit: async (v, start) => {
      const target = commitTarget(start, state.selection);
      if (target === null) return;
      const intent = { kind: 'transform', target };
      if (state.mode === 'translate') intent.position = v.position;
      if (state.mode === 'rotate') intent.heading = v.heading;
      if (state.mode === 'scale') intent.scale = v.scale;
      await sendIntent(intent);
    },
  });
  $('undo').addEventListener('click', () => sendPost('/api/undo'));
  $('redo').addEventListener('click', () => sendPost('/api/redo'));
  $('reset-scene').addEventListener('click', () => {
    if (state.busy || state.running || state.locked) return;
    state.catalog?.cancel();
    $('reset-dialog').showModal();
  });
  $('reset-cancel').addEventListener('click', () => $('reset-dialog').close());
  $('reset-confirm').addEventListener('click', async () => {
    $('reset-dialog').close();
    await sendPost('/api/reset');
  });
  $('save').addEventListener('click', doSave);
  $('do-patch').addEventListener('click', doPatch);
  $('do-launch').addEventListener('click', doLaunch);
  $('stop-launch').addEventListener('click', async () => {
    try {
      await api('/api/launch/stop', {});
      note('Closing the research Dolphin instance…');
    } catch (e) {
      note(e.message);
    }
  });
  $('prediction').addEventListener('input', refreshSaveState);
  $('inspector').addEventListener('change', onTyped);
  $('inspector').addEventListener('click', onDuplicateClick);
  $('inspector').addEventListener('click', async e => {
    const button = e.target.closest('[data-counterpart]');
    if (!button) return;
    const offset = Number(button.dataset.counterpart);
    const p = state.placements.find(p => p.offset === offset);
    if (!p) return;
    for (const layer of p.layers.length ? p.layers : ['(unlayered)']) state.visible.add(layer);
    if (state.resources?.has(offset)) $('resources-visible').checked = true;
    renderLayers(index);
    apply();
    state.selection = { offset, index: 0, total: 1 };
    state.scene.select(offset);
    state.scene.frameSelection();
    await reselect();
  });
  refreshSaveState();
  state.catalog = bindCatalog({
    api,
    scene: state.scene,
    select: selectOffset,
    changed: afterChange,
    busy: () => state.busy || state.running || state.locked,
    note,
    validationState: running => {
      state.locked = running || state.running;
      refreshSaveState();
    },
  });
  try {
    await state.catalog.reload();
  } catch (e) {
    note('Project browser unavailable: ' + e.message);
  }
  if (state.running) pollLaunch();

  window.addEventListener('keydown', e => {
    if ($('drop-dialog').open || $('reset-dialog').open) return;
    if (typingIn(e.target)) return; // a position field must never fly the camera
    flying.fast = e.shiftKey;
    flying.slow = e.altKey;
    if (isBound(e.key)) {
      e.preventDefault();
      flying.held.add(e.key);
      state.scene.setFly(flying);
      return;
    }
    if (e.key === 'f') state.scene.frameSelection();
    if (e.key === 'F') state.scene.frameAll();
    if (e.key === 't') state.scene.topDown(); // quickstart scenario 2
    if (e.key === 'v' || e.key === 'V') toggleWireframe();
    if (e.key === 'w') setMode('translate');
    if (e.key === 'e') setMode('rotate');
    if (e.key === 'r') setMode('scale');
    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendPost(e.shiftKey ? '/api/redo' : '/api/undo');
    }
  });
  window.addEventListener('keyup', e => {
    flying.fast = e.shiftKey;
    flying.slow = e.altKey;
    if (flying.held.delete(e.key)) state.scene.setFly(flying);
  });
  // A key released while the window was not focused is never seen, and the camera would drift for ever.
  window.addEventListener('blur', () => {
    flying.held.clear();
    state.scene.setFly(flying);
  });
}

// On screen rather than in a console: if the view is empty, this says whether the proxies exist, whether the
// canvas has a size, and where the camera is pointing.
function showDiagnostics() {
  const tick = () => {
    const d = state.scene.diagnostics();
    const small = d.canvas.w < 40 || d.canvas.h < 40;
    $('diag').textContent =
      d.proxies +
      ' drawn (' +
      d.meshed +
      ' as meshes), canvas ' +
      d.canvas.w +
      '\u00d7' +
      d.canvas.h +
      ', ' +
      d.scenery +
      ' scenery blocks, camera ' +
      d.distanceText;
    $('diag').classList.toggle('bad', small || !d.proxies);

    // A collapsed viewport used to look exactly like an empty level. Say which one it is, in words, on top of
    // everything, rather than leaving a black rectangle to be interpreted.
    // Three consecutive bad readings, not one: layout has not always settled on the first tick, and an
    // overlay that flashes on every load would teach a person to ignore it.
    bad = small || !d.proxies ? bad + 1 : 0;
    if (bad >= 3) {
      fail(
        small
          ? 'The viewport has no room to draw in: it measures ' +
              d.canvas.w +
              ' by ' +
              d.canvas.h +
              ' pixels. ' +
              'This is a page layout fault, not a level fault; ' +
              d.proxies +
              ' proxies are ready to draw.'
          : 'The level opened but produced no proxies to draw.',
      );
    } else if (shown) {
      $('error').hidden = true;
      shown = false;
    }
    setTimeout(tick, 1000);
  };
  tick();
}
let shown = false,
  bad = 0;

function apply() {
  const offsets = visibleSet(state.placements, state.visible);
  if (!$('resources-visible').checked) for (const offset of state.resources ?? []) offsets.delete(offset);
  state.scene.setVisible(offsets);
}

// Free flight and see-through (feature 004). A level holds models big enough to swallow the camera: a cloud
// layer, a landmass, a water dome. Inside one, orbiting around a target that is also inside it cannot get out,
// and the picture is an unreadable grey. The arrows fly out of it; V makes the inside of a mesh legible.
const flying = { held: new Set(), fast: false, slow: false };
const typingIn = el => !!el?.closest?.('input, textarea, select');

function toggleWireframe(on) {
  const now = state.scene.setWireframe(on === undefined ? !state.scene.state.wireframe : on);
  $('wireframe').classList.toggle('on', now);
  return now;
}

function renderLayers(index) {
  const byName = new Map(state.layers.map(l => [l.name, l]));
  $('layers').innerHTML = index
    .map(l => {
      const meta = byName.get(l.name);
      return (
        `<label class="layer"><input type="checkbox" data-layer="${l.name.replace(/"/g, '&quot;')}"
        ${state.visible.has(l.name) ? 'checked' : ''}>
        <span class="n" title="${l.name.replace(/"/g, '&quot;')}">${l.name.replace(/</g, '&lt;')}</span>
        <span class="c">${l.count}</span></label>` + (meta ? renderGrades(meta.grades) : '')
      );
    })
    .join('');
  for (const box of $('layers').querySelectorAll('input[data-layer]')) {
    box.addEventListener('change', () => {
      state.visible = toggle(state.visible, box.dataset.layer);
      apply();
    });
  }
}

async function onPick(ev) {
  // The gizmo saw this pointerdown first. If it took it, this is a grab of a handle, not a click on the level.
  const g = state.scene.gizmoState();
  if (!shouldPick({ button: ev.button, gizmoAxis: g.axis, gizmoDragging: g.dragging })) return;
  const hits = orderHits(state.scene.hitsAt(ev.clientX, ev.clientY));
  const next = pickNext({ hits, pointer: { x: ev.clientX, y: ev.clientY }, previous: state.selection });
  state.selection = next;
  state.scene.select(next ? next.offset : null);
  state.catalog?.highlight(next?.offset ?? null);
  if (state.mode) state.scene.setGizmoMode(state.mode);
  if (!next) {
    $('inspector').innerHTML = renderPlacement(null);
    return;
  }
  try {
    const b = await api(`/api/placement/${next.offset}`);
    $('inspector').innerHTML =
      renderPlacement(b.placement, b.safety, b.replace_targets, {
        hasRuntimeMap: state.hasRuntimeMap,
        script: b.script,
      }) +
      runtimeNote(next.offset) +
      (next.total > 1
        ? `<div class="ev" style="padding:0 12px 12px">${next.index + 1} of ${next.total} under the cursor; click again to reach the next</div>`
        : '');
  } catch (e) {
    $('inspector').innerHTML = `<div class="empty">${e.message}</div>`;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Editing (T036 to T038). Every change goes to the editor process as an intent; the view holds no bytes and
// applies nothing locally, so what is drawn is always what the session actually contains.

function setMode(mode) {
  state.mode = mode;
  for (const [id, m] of [
    ['gizmo-move', 'translate'],
    ['gizmo-rotate', 'rotate'],
    ['gizmo-scale', 'scale'],
    ['gizmo-off', null],
  ]) {
    $(id).classList.toggle('on', state.mode === m);
  }
  state.scene.setGizmoMode(mode);
}

function updateFields(v) {
  const set = (sel, value) => {
    const el = document.querySelector(sel);
    if (el && document.activeElement !== el) el.value = value;
  };
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
    intent.position = [0, 1, 2].map(i =>
      Number(document.querySelector('[data-edit="position"][data-axis="' + i + '"]').value),
    );
    if (intent.position.some(n => !Number.isFinite(n))) return note('a position needs three numbers');
  } else {
    const n = Number(el.value);
    if (!Number.isFinite(n)) return note(attribute + ' needs a number');
    intent[attribute] = n;
  }
  await sendIntent(intent);
}

async function sendIntent(intent) {
  if (!intent.target || state.busy || state.running || state.locked) return;
  state.busy = true;
  refreshSaveState();
  try {
    await afterChange(await api('/api/edit', intent));
  } catch (e) {
    note(e.message);
    await reselect();
  } finally {
    state.busy = false;
    refreshSaveState();
  }
}

async function sendPost(path) {
  if (state.busy || state.running || state.locked) return;
  state.busy = true;
  refreshSaveState();
  try {
    await afterChange(await api(path, {}));
  } catch (e) {
    note(e.message);
  } finally {
    state.busy = false;
    refreshSaveState();
  }
}

// The session is the truth: redraw the edited proxy from what came back, never from what was dragged.
async function afterChange(b) {
  state.busy = true;
  refreshSaveState();
  try {
    if (b.reset_scene) {
      state.selection = null;
      $('inspector').innerHTML = renderPlacement(null);
      $('resources-visible').checked = false;
      $('scenery-visible').checked = true;
      $('scripted-visible').checked = true;
      $('large-surfaces-solid').checked = false;
      state.scene.setSceneryVisible(true);
      state.scene.setLargeSurfacesSolid(false);
      toggleWireframe(false);
    }
    if (b.rebuild_scene) {
      const [data, payload] = await Promise.all([api('/api/placements'), api('/api/meshes')]);
      const decoded = decodeMeshPayload(payload);
      state.placements = data.placements;
      state.layers = data.layers;
      if (state.selection && !state.placements.some(p => p.offset === state.selection.offset)) {
        state.selection = null;
        $('inspector').innerHTML = renderPlacement(null);
        state.catalog?.highlight(null);
      }
      state.layerIndex = layerIndex(state.placements);
      if (b.reset_scene) state.visible = showAll(state.layerIndex);
      state.resources = new Set((payload.scene_roles ?? []).map(r => r.offset));
      state.scene.build(
        state.placements,
        new Map(state.placements.map(p => [p.offset, gradeOf(p)])),
        decoded.models,
        decoded.scenery,
        { preserveCamera: true },
      );
      state.scene.setScriptedPreviews(payload.scripted_previews ?? [], decoded.models);
      state.scene.setScriptedVisible($('scripted-visible').checked);
      renderLayers(state.layerIndex);
      apply();
    }
    const p = b.placement;
    if (p) {
      const local = state.placements.find(x => x.offset === p.offset);
      if (local) Object.assign(local, p);
      state.selection = { offset: p.offset, index: 0, total: 1 };
      state.scene.refresh(p.offset);
      state.scene.select(p.offset);
      if (state.mode) state.scene.setGizmoMode(state.mode);
      updateFields({ position: p.position, heading: p.rotation.heading, scale: p.scale });
    }
    state.dirty = b.dirty;
    if (Object.hasOwn(b, 'saved')) state.saved = b.saved;
    state.patched = b.patched ?? null;
    state.undoDepth = b.undo_depth ?? state.undoDepth;
    state.redoDepth = b.redo_depth ?? state.redoDepth;
    await reselect();
    if (b.rebuild_scene) await state.catalog?.reload();
    if (b.reset_scene) {
      state.scene.select(null);
      state.catalog?.highlight(null);
      state.scene.frameAll();
      note(`Scene reset: ${b.reset_count} edits undone. Redo can recover them.`);
    }
  } finally {
    state.busy = false;
    refreshSaveState();
  }
}

async function selectOffset(offset) {
  const p = state.placements.find(p => p.offset === offset);
  if (!p) return;
  for (const layer of p.layers.length ? p.layers : ['(unlayered)']) state.visible.add(layer);
  if (state.resources?.has(offset)) $('resources-visible').checked = true;
  renderLayers(state.layerIndex);
  apply();
  state.selection = { offset, index: 0, total: 1 };
  state.scene.select(offset);
  state.scene.frameSelection();
  if (state.mode) state.scene.setGizmoMode(state.mode);
  await reselect();
}

async function reselect() {
  if (!state.selection) return;
  state.catalog?.highlight(state.selection.offset);
  const b = await api('/api/placement/' + state.selection.offset);
  $('inspector').innerHTML =
    renderPlacement(b.placement, b.safety, b.replace_targets, {
      hasRuntimeMap: state.hasRuntimeMap,
      script: b.script,
      addition: b.addition,
    }) + runtimeNote(state.selection.offset);
}

const note = msg => {
  $('save-note').textContent = msg;
  $('status-tip').textContent = msg;
};

function refreshSaveState() {
  const busy = state.busy || state.running || state.locked;
  state.catalog?.lock();
  $('dirty').textContent = state.dirty ? state.undoDepth + ' unsaved edit' + (state.undoDepth > 1 ? 's' : '') : '';
  $('dirty').classList.toggle('on', !!state.dirty);
  $('save').disabled = busy || !state.dirty;
  $('do-patch').disabled = busy || (!state.saved && !state.dirty);
  $('do-launch').disabled = busy || !state.patched || state.dirty;
  $('stop-launch').disabled = !state.running;
  $('launch-mode').disabled = !!busy;
  $('skip-intro').disabled = !!busy || !state.tutorial || $('launch-mode').value === 'play';
  $('undo').disabled = busy || !state.undoDepth;
  $('redo').disabled = busy || !state.redoDepth;
  $('reset-scene').disabled = !!busy;
  state.levels?.lock(!!busy);
  $('snapshot-capture').disabled = !state.capturable || state.busy;
  $('save-state').textContent = state.dirty
    ? 'unsaved changes'
    : state.running
      ? 'Dolphin running'
      : state.patched
        ? 'patched, ready to launch'
        : state.saved
          ? 'saved, not patched'
          : 'no edit yet';
}

async function doSave() {
  if (state.busy || state.running || state.locked) return;
  state.busy = true;
  refreshSaveState();
  try {
    const b = await api('/api/save', {});
    if (!b.written) throw new Error(b.plan.failures.map(f => f.reason).join('; '));
    state.saved = b.written;
    state.patched = null;
    state.dirty = b.dirty;
    const additions = b.plan.native_additions?.length ?? 0;
    note(
      'Saved to ' +
        b.written +
        '. ' +
        b.plan.changes.length +
        ' field changes' +
        (additions ? ` and ${additions} added object${additions === 1 ? '' : 's'}` : '') +
        '.',
    );
  } catch (e) {
    state.saved = null;
    note('refused: ' + e.message);
  }
  state.busy = false;
  refreshSaveState();
}

async function doPatch() {
  state.busy = true;
  refreshSaveState();
  try {
    if (state.dirty || !state.saved) {
      const saved = await api('/api/save', {});
      if (!saved.written) throw new Error(saved.plan.failures.map(f => f.reason).join('; '));
      state.saved = saved.written;
      state.dirty = saved.dirty;
      state.patched = null;
    }
    note('Rebuilding and verifying the archive…');
    const b = await api('/api/patch', {});
    state.patched = b.patch;
    note('Patch verified, ready for Dolphin.');
    if ($('launch-after-patch').checked) await doLaunch();
  } catch (e) {
    note('Failed: ' + e.message);
  } finally {
    state.busy = false;
    refreshSaveState();
  }
}

async function doLaunch() {
  const prediction = $('prediction').value.trim();
  try {
    await api('/api/launch', {
      prediction,
      mode: $('launch-mode').value,
      skip_intro: !!state.tutorial && $('launch-mode').value !== 'play' && $('skip-intro').checked,
    });
    state.running = true;
    state.locked = true;
    note('Starting Dolphin with the current patch…');
    pollLaunch();
  } catch (e) {
    note('refused: ' + e.message);
  }
  refreshSaveState();
}

// Poll across reloads; the owned game releases the lock when it has actually stopped.
async function pollLaunch() {
  const started = Date.now();
  const tick = async () => {
    let b;
    try {
      b = await api('/api/launch');
    } catch {
      return setTimeout(tick, 5000);
    }
    state.running = !!b.launch?.running;
    state.locked = b.locked;
    state.capturable = !!b.launch?.running && b.launch?.progress?.phase === 'playing';
    refreshSaveState();
    if (b.launch?.running) {
      const p = b.launch.progress ?? {};
      const phase =
        {
          booting: 'Starting Dolphin',
          macro: `Tutorial macro: step ${p.step ?? 0}/${p.steps ?? '?'}`,
          'preparing-entry': `Preparing direct entry: step ${p.step ?? 0}/${p.steps ?? 23}`,
          'restoring-entry': 'Loading the level entry checkpoint',
          playing: 'Normal play: you have control',
          stopping: 'Closing Dolphin',
          finished: 'Test finished, closing Dolphin',
        }[p.phase] ?? 'Preparing Dolphin';
      note(
        phase +
          ' · ' +
          Math.round((Date.now() - started) / 1000) +
          ' s' +
          (p.consumption?.verified ? ' · Modified archive loaded.' : ''),
      );
      return setTimeout(tick, 5000);
    }
    state.capturable = false;
    note(
      b.launch?.error
        ? 'Launch failed: ' + b.launch.error
        : (b.launch?.status === 'STOPPED'
            ? 'Dolphin stopped.'
            : ['test', 'direct-test'].includes(b.launch?.mode)
              ? 'Macro completed, Dolphin closed.'
              : 'Game closed.') +
            (b.launch?.consumption?.verified ? ' Patch consumption confirmed.' : '') +
            (b.launch?.screenshots?.length
              ? ` ${b.launch.screenshots.length} screenshots saved in .local/dolphin-evidence/.`
              : ''),
    );
    refreshSaveState();
  };
  tick();
}

// ---------------------------------------------------------------------------------------------------------
// The game-time view (feature 006). A snapshot is what the running game held at one moment: it is read from
// Dolphin while an editor-owned run is playing, kept as evidence under .local, and drawn as an overlay. It is
// never a property of the file: nothing here is saved or patched.

async function loadSnapshot() {
  let b;
  try {
    b = await api('/api/snapshot');
  } catch (e) {
    return note('snapshot unavailable: ' + e.message);
  }
  state.snapshot = b.snapshot;
  state.capturable = !!b.capturable;
  const box = $('snapshot-visible');
  box.disabled = !state.snapshot;
  if (!state.snapshot) {
    $('snapshot-count').textContent = '';
    return;
  }
  const c = state.snapshot.counts ?? {};
  $('snapshot-count').textContent = String(c.active ?? 0);
  $('snapshot-info').textContent =
    `Taken ${new Date(state.snapshot.taken).toLocaleString()} (${state.snapshot.moment ?? 'during play'}): ` +
    `${c.active ?? 0} active, ${c.dormant ?? 0} dormant, ${c.template ?? 0} templates, ${c.finished ?? 0} finished, ` +
    `${state.snapshot.moved ?? 0} moved` +
    (state.snapshot.actors ? `, ${state.snapshot.actors.length} live actors` : '') +
    (state.snapshot.same_bytes === false ? '. Taken on other level bytes.' : '.');
  state.scene.setSnapshotActors(state.snapshot.actors ?? [], state.meshes ?? new Map());
  if (box.checked) applySnapshot();
}

function applySnapshot() {
  const on = $('snapshot-visible').checked && !!state.snapshot;
  state.scene.setRuntimeStates(on ? state.snapshot.states : null);
  apply();
}

async function captureSnapshot() {
  if (!state.capturable || state.busy) return;
  state.busy = true;
  refreshSaveState();
  try {
    note('Reading the scene from Dolphin…');
    const b = await api('/api/snapshot', { moment: $('prediction').value.trim() || 'during play' });
    state.snapshot = b.snapshot;
    await loadSnapshot();
    $('snapshot-visible').checked = true;
    applySnapshot();
    note(`Scene captured: ${b.snapshot.counts?.active ?? 0} active objects, ${b.snapshot.moved ?? 0} moved.`);
  } catch (e) {
    note('capture refused: ' + e.message);
  } finally {
    state.busy = false;
    refreshSaveState();
  }
}

// What the snapshot says about one object, for the inspector.
function runtimeNote(offset) {
  const r = state.snapshot?.states?.[offset];
  if (!r) return '';
  const where =
    r.moved > 0.5
      ? ` · in game at ${r.current.map(v => Math.round(v * 100) / 100).join(', ')} (${r.moved} units away)`
      : '';
  return `<div class="row"><span class="k">in game</span><span class="v ${r.label === 'active' ? 'proven' : 'withheld'}" title="snapshot read from Dolphin, LIKELY">${r.label}${r.actor ? ' · has an actor' : ''}${where}</span></div>`;
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
  if (id === 'dup-ack') {
    $('dup-confirm').disabled = !ev.target.checked;
  }
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
    await afterChange(b);
    await reselect();
    note('duplicated into 0x' + target.toString(16) + '; save to write it');
  } catch (e) {
    note('refused: ' + e.message);
  }
}
