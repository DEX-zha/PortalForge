// The Project pane: folder tree, search, cards with 3D thumbnails, and the drag that ends in a drop.
// The server owns the transaction; this controller only holds its opaque token.
import { renderRule } from './inspector.mjs';
import { assetFolder, folderTree, inFolder, libraryCards } from './asset-folders.mjs';
import { createThumbnails } from './thumbnails.mjs';

export function filterCatalog(entries, query = '', category = 'all') {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return entries.filter(
    p =>
      (category === 'all' ||
        (category === 'available' ? p.available : p.category === category || p.addition?.status === category)) &&
      words.every(w => [p.name, p.model, ...(p.layers ?? [])].join(' ').toLocaleLowerCase().includes(w)),
  );
}

export function bindCatalog({ api, scene, select, changed, busy, note, validationState = () => {} }) {
  const $ = id => document.getElementById(id),
    dialog = $('drop-dialog');
  let entries = [],
    dragging = null,
    draft = null,
    placement = null,
    epoch = 0,
    submitting = false;
  let pointerDrag = null,
    suppressClick = false;
  let additionMode = false,
    capacity = null;
  let selectedFolder = [],
    selectedOffset = null;
  // The Project pane shows the open level, or every kind of object of the game (phase P). In the second scope a
  // kind the level holds is this level's own entry; a kind held elsewhere is a read-only card.
  let scope = 'level',
    library = null;
  const shown = () =>
    scope === 'game' && library?.status === 'ready' ? libraryCards(library.kinds, entries) : entries;
  let testing = false,
    pollTimer = null;
  const thumbnails = createThumbnails(scene);
  const blocked = () => busy() || submitting;
  function render() {
    const all = shown();
    const rows = filterCatalog(all, $('object-search').value, $('object-category').value)
      .filter(p => inFolder(p, selectedFolder))
      .sort(
        (a, b) =>
          Number(!a.model) - Number(!b.model) || (a.name ?? '').localeCompare(b.name ?? '', 'en', { numeric: true }),
      );
    const available = entries.filter(p => p.addition?.available).length;
    const families = new Set(entries.filter(p => p.addition?.testable).map(p => p.addition.family)).size;
    $('object-count').textContent =
      scope === 'game'
        ? libraryNote(rows.length)
        : `${rows.length} / ${entries.length} objects · ${available} can add · ${families} testable families` +
          (capacity
            ? ` · ${capacity.used}/${capacity.limit} added${capacity.confirmed ? ` (${capacity.confirmed} confirmed by boots)` : ''}`
            : '');
    const fragment = document.createDocumentFragment();
    if (scope === 'game' && library?.status !== 'ready') fragment.append(libraryPrompt());
    else if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'No objects match this search.';
      fragment.append(empty);
    }
    for (const p of rows) {
      const button = document.createElement('button');
      button.className = 'object-item' + (p.offset === null ? ' elsewhere' : '');
      // A kind held by other levels only has no record here: it carries no offset and cannot be dragged.
      if (p.offset === null) button.dataset.kind = p.kind;
      else button.dataset.object = p.offset;
      button.draggable = p.offset !== null && p.available && !blocked();
      button.title = [
        p.name,
        p.model,
        p.layers.join(', '),
        p.levels ? `In ${p.levels.length} level(s)` : null,
        p.reason ?? (additionMode ? 'Drag into the scene to add an object' : 'Drag into the scene to prepare a copy'),
      ]
        .filter(Boolean)
        .join('\n');
      const name = document.createElement('span');
      name.className = 'object-name';
      name.textContent = p.name ?? 'Unnamed';
      const preview = document.createElement('span');
      preview.className = 'asset-preview';
      if (p.offset !== null) preview.dataset.thumbnail = p.offset;
      preview.textContent = '◇';
      const meta = document.createElement('span');
      meta.className = 'asset-meta';
      const kind = document.createElement('span');
      kind.textContent = assetFolder(p)[1];
      const availability = document.createElement('span');
      availability.textContent = p.addition?.label ?? (p.available ? (additionMode ? 'Add' : 'Copy') : 'View only');
      availability.className = p.available ? 'copyable' : '';
      availability.dataset.compatibility = p.addition?.status ?? '';
      availability.title = p.addition?.reason ?? '';
      meta.append(kind, availability);
      button.append(name, preview, meta);
      button.classList.toggle('selected', p.offset !== null && p.offset === selectedOffset);
      button.setAttribute('aria-pressed', String(p.offset !== null && p.offset === selectedOffset));
      fragment.append(button);
    }
    $('objects').replaceChildren(fragment);
    thumbnails.observe($('objects'));
  }
  function libraryNote(count) {
    if (library?.status !== 'ready') return 'The game-wide catalogue has not been built yet.';
    return `${count} / ${library.kinds.length} kinds in ${library.levels} levels · ${library.here} in this level · ${library.elsewhere} in other levels only`;
  }
  // Building reads every decoded level once: a few seconds, asked for rather than done behind the user's back.
  function libraryPrompt() {
    const box = document.createElement('p');
    box.className = 'empty';
    const button = document.createElement('button');
    button.id = 'build-library';
    button.textContent = 'Build the game catalogue';
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'Reading every level…';
      try {
        library = await api('/api/library', {});
        folders();
        render();
      } catch (e) {
        note(e.message);
        button.disabled = false;
        button.textContent = 'Build the game catalogue';
      }
    });
    box.append('Every kind of object of the 76 levels, with the levels that hold it. ', button);
    return box;
  }
  async function chooseScope(next) {
    if (next === scope) return;
    scope = next;
    selectedFolder = [];
    $('scope-level').classList.toggle('on', scope === 'level');
    $('scope-game').classList.toggle('on', scope === 'game');
    if (scope === 'game' && !library) {
      try {
        library = await api('/api/library');
      } catch (e) {
        library = { status: 'missing', kinds: [] };
        note(e.message);
      }
    }
    folders();
    render();
  }
  $('scope-level').addEventListener('click', () => chooseScope('level'));
  $('scope-game').addEventListener('click', () => chooseScope('game'));
  function folderButton(name, path, count, child = false, tag = 'button') {
    const b = document.createElement(tag);
    b.className = 'folder' + (child ? ' child' : '');
    b.dataset.folder = JSON.stringify(path);
    b.append(document.createTextNode(name));
    if (count !== undefined) {
      const n = document.createElement('small');
      n.textContent = count;
      b.append(n);
    }
    return b;
  }
  function folders() {
    const root = $('folder-tree');
    const all = shown();
    root.replaceChildren(folderButton(scope === 'game' ? 'All kinds' : 'All objects', [], all.length));
    for (const p of folderTree(all)) {
      const branch = document.createElement('details');
      branch.open = true;
      // Summary is already a keyboard-operable disclosure. Do not nest a button in it.
      branch.append(folderButton(p.name, [p.name], p.count, false, 'summary'));
      for (const c of p.children) branch.append(folderButton(c.name, [p.name, c.name], c.count, true));
      root.append(branch);
    }
    breadcrumb();
  }
  function breadcrumb() {
    const nav = $('folder-breadcrumb');
    nav.replaceChildren(folderButton('Objects', []));
    selectedFolder.forEach((name, i) => {
      nav.append(document.createTextNode(' / '), folderButton(name, selectedFolder.slice(0, i + 1)));
    });
    for (const el of $('folder-tree').querySelectorAll('[data-folder]'))
      el.classList.toggle('active', el.dataset.folder === JSON.stringify(selectedFolder));
  }
  function chooseFolder(e) {
    const b = e.target.closest('[data-folder]');
    if (!b) return;
    selectedFolder = JSON.parse(b.dataset.folder);
    // Let Enter/Space/click toggle a summary through its native default action.
    if (b.tagName !== 'SUMMARY') {
      e.preventDefault();
      const branch = b.closest('details');
      if (branch) branch.open = true;
    }
    breadcrumb();
    render();
    $('objects').scrollTop = 0;
  }
  $('folder-tree').addEventListener('click', chooseFolder);
  $('folder-breadcrumb').addEventListener('click', chooseFolder);
  function hierarchy() {
    const rows = filterCatalog(entries, $('hierarchy-search').value),
      fragment = document.createDocumentFragment();
    for (const p of rows) {
      const b = document.createElement('button');
      b.className = 'hierarchy-item';
      b.dataset.hierarchy = p.offset;
      b.textContent = p.name ?? 'Unnamed';
      b.title = p.name;
      b.classList.toggle('selected', p.offset === selectedOffset);
      fragment.append(b);
    }
    $('hierarchy-count').textContent = rows.length;
    $('hierarchy-list').replaceChildren(fragment);
  }
  function highlight(offset) {
    selectedOffset = offset;
    for (const el of $('objects').querySelectorAll('[data-object]')) {
      const yes = Number(el.dataset.object) === offset;
      el.classList.toggle('selected', yes);
      el.setAttribute('aria-pressed', String(yes));
    }
    for (const el of $('hierarchy-list').querySelectorAll('[data-hierarchy]'))
      el.classList.toggle('selected', Number(el.dataset.hierarchy) === offset);
    $('hierarchy-list').querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
    updateTests();
  }
  $('hierarchy-search').addEventListener('input', hierarchy);
  $('hierarchy-list').addEventListener('click', e => {
    const b = e.target.closest('[data-hierarchy]');
    if (b && !blocked()) select(Number(b.dataset.hierarchy)).catch(e => note(e.message));
  });
  async function reload() {
    const b = await api('/api/catalog');
    additionMode = b.addition_mode === 'native';
    capacity = b.addition_capacity ?? null;
    entries = b.entries.map(p =>
      additionMode ? { ...p, available: !!p.addition?.available, reason: p.addition?.reason ?? null } : p,
    );
    // Another level may have been opened: what "here" means changed, so the library is asked again when shown.
    if (library) library = scope === 'game' ? await api('/api/library').catch(() => null) : null;
    thumbnails.invalidate();
    folders();
    hierarchy();
    render();
    updateTests();
    if (!pollTimer) pollTests();
  }
  function updateTests() {
    $('test-addition').disabled = blocked() || !entries.find(p => p.offset === selectedOffset)?.addition?.testable;
    $('test-addition-batch').disabled =
      blocked() || !entries.some(p => p.addition?.testable && !p.addition?.report && !p.available);
    $('stop-addition-test').disabled = !testing;
  }
  async function pollTests() {
    clearTimeout(pollTimer);
    pollTimer = null;
    try {
      const r = await api('/api/addition-validation'),
        wasTesting = testing;
      testing = !!r.running;
      validationState(testing);
      updateTests();
      if (testing) {
        const p = r.progress ?? {};
        $('addition-test-status').textContent =
          `Testing: run ${p.run ?? 1}/${p.runs ?? 2}, ${p.phase ?? 'preparing'}${p.step ? ' · step ' + p.step : ''}`;
        pollTimer = setTimeout(pollTests, 3000);
      } else if (wasTesting || r.result || r.error) {
        $('addition-test-status').textContent =
          r.error ??
          (r.result
            ? `Test ${r.result.status}: ${r.result.id}. See each object's compatibility details.`
            : 'Test stopped.');
        if (wasTesting) {
          const b = await api('/api/catalog');
          entries = b.entries.map(p => ({ ...p, available: !!p.addition?.available, reason: p.addition?.reason }));
          render();
          hierarchy();
          if (selectedOffset !== null) await select(selectedOffset);
        }
      }
    } catch (e) {
      if (testing) {
        $('addition-test-status').textContent = e.message;
        pollTimer = setTimeout(pollTests, 5000);
      }
    }
  }
  async function startTests(sources) {
    if (blocked() || !sources.length) return;
    try {
      await api('/api/addition-validation', { sources });
      testing = true;
      validationState(true);
      updateTests();
      pollTests();
    } catch (e) {
      note(e.message);
    }
  }
  $('test-addition').addEventListener('click', () => startTests([selectedOffset]));
  $('test-addition-batch').addEventListener('click', () => {
    const families = new Set(),
      sources = [];
    for (const p of filterCatalog(entries, $('object-search').value, $('object-category').value).filter(p =>
      inFolder(p, selectedFolder),
    )) {
      if (!p.addition?.testable || p.addition.report || p.available || families.has(p.addition.family)) continue;
      families.add(p.addition.family);
      sources.push(p.offset);
      if (sources.length === 2) break;
    }
    if (!sources.length) note('No untested type matches the current Project filter.');
    else startTests(sources);
  });
  $('stop-addition-test').addEventListener('click', async () => {
    try {
      await api('/api/addition-validation/stop', {});
      $('addition-test-status').textContent = 'Stopping the test Dolphin…';
    } catch (e) {
      note(e.message);
    }
  });
  function clearPreview() {
    scene.clearDropPreview();
    $('drop-hint').hidden = true;
  }
  function cancel() {
    if (submitting) return;
    releasePointer();
    epoch++;
    draft = null;
    placement = null;
    dragging = null;
    clearPreview();
    if (dialog.open) dialog.close();
  }
  function lock() {
    if (busy()) {
      dragging = null;
      if (!submitting) cancel();
    }
    for (const el of $('objects').querySelectorAll('[data-object]'))
      el.draggable = !blocked() && !!entries.find(p => p.offset === Number(el.dataset.object))?.available;
    updateConfirm();
    updateTests();
  }
  function updateConfirm() {
    $('drop-confirm').disabled =
      blocked() || !draft || [...$('drop-review').querySelectorAll('[data-drop-ack]')].some(e => !e.checked);
  }
  $('object-search').addEventListener('input', render);
  $('object-category').addEventListener('change', render);
  $('objects').addEventListener('click', e => {
    if (suppressClick) {
      e.preventDefault();
      suppressClick = false;
      return;
    }
    const foreign = e.target.closest('[data-kind]');
    if (foreign) {
      const kind = library?.kinds.find(k => k.key === foreign.dataset.kind);
      if (kind) note(`${kind.name} is not in this level. It is held by: ${kind.levels.map(l => l.name).join(', ')}.`);
      return;
    }
    const el = e.target.closest('[data-object]');
    if (el && !blocked()) {
      const p = entries.find(p => p.offset === Number(el.dataset.object));
      if (p && !p.available) note(p.reason);
      select(Number(el.dataset.object)).catch(e => note(e.message));
    }
  });
  // Own the pointer gesture: native HTML dragging can be intercepted by a host window.
  // Capture on the Project list keeps movement/release events when crossing into the canvas.
  function releasePointer() {
    const p = pointerDrag;
    pointerDrag = null;
    if (p && $('objects').hasPointerCapture(p.id)) $('objects').releasePointerCapture(p.id);
    document.body.classList.remove('placing-object');
  }
  $('objects').addEventListener('pointerdown', e => {
    suppressClick = false;
    if (e.button !== 0 || !e.isPrimary || blocked() || dialog.open) return;
    const el = e.target.closest('[data-object]'),
      p = entries.find(p => p.offset === Number(el?.dataset.object));
    if (!p?.available) {
      if (p) note(p.reason);
      return;
    }
    e.preventDefault();
    el.focus({ preventScroll: true });
    pointerDrag = { id: e.pointerId, source: p.offset, x: e.clientX, y: e.clientY, active: false };
    $('objects').setPointerCapture(e.pointerId);
  });
  $('objects').addEventListener('pointermove', e => {
    const p = pointerDrag;
    if (!p || p.id !== e.pointerId) return;
    if (blocked()) return cancel();
    if (!p.active && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) return;
    p.active = true;
    dragging = p.source;
    suppressClick = true;
    document.body.classList.add('placing-object');
    locate(e);
  });
  $('objects').addEventListener('pointerup', e => {
    const p = pointerDrag;
    if (!p || p.id !== e.pointerId) return;
    const hit = p.active ? locate(e) : null;
    releasePointer();
    dragging = null;
    suppressClick = true;
    if (p.active) {
      if (hit) openDrop(p.source, hit);
      else clearPreview();
    } else select(p.source).catch(e => note(e.message));
  });
  $('objects').addEventListener('pointercancel', cancel);
  $('objects').addEventListener('lostpointercapture', () => {
    if (pointerDrag) cancel();
  });
  $('objects').addEventListener('dragstart', e => {
    if (pointerDrag) {
      e.preventDefault();
      return;
    }
    const el = e.target.closest('[data-object]'),
      p = entries.find(p => p.offset === Number(el?.dataset.object));
    if (!p?.available || blocked() || dialog.open) {
      e.preventDefault();
      return;
    }
    dragging = p.offset;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-portalforge-placement', String(p.offset));
  });
  $('objects').addEventListener('dragend', () => {
    dragging = null;
    if (!dialog.open) clearPreview();
  });
  function locate(e) {
    if (dragging === null || blocked()) return null;
    if (document.elementFromPoint(e.clientX, e.clientY) !== $('c')) {
      clearPreview();
      return null;
    }
    const hit = scene.dropPosition(e.clientX, e.clientY, $('drop-height').valueAsNumber);
    if (!hit) {
      clearPreview();
      return null;
    }
    scene.previewDrop(dragging, hit.position);
    $('drop-hint').textContent =
      `${hit.mode === 'surface' ? 'Visible surface' : 'Horizontal plane'} : ${hit.position.join(' · ')} — ${additionMode ? 'release to add an object' : 'release to choose the object to replace'}`;
    $('drop-hint').hidden = false;
    return hit;
  }
  $('c').addEventListener('dragover', e => {
    if (dragging === null || blocked()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    locate(e);
  });
  $('c').addEventListener('dragleave', clearPreview);
  $('c').addEventListener('drop', async e => {
    if (dragging === null || blocked()) return;
    e.preventDefault();
    const hit = locate(e),
      source = dragging;
    dragging = null;
    if (!hit) return;
    await openDrop(source, hit);
  });
  async function openDrop(source, hit) {
    if (additionMode) {
      if (blocked()) return;
      submitting = true;
      lock();
      try {
        const result = await api('/api/edit', { kind: 'add', source, position: hit.position });
        clearPreview();
        await changed(result);
        note('Object added. Save and patch to include it in the next game launch.');
      } catch (err) {
        clearPreview();
        note(err.message);
      } finally {
        submitting = false;
        lock();
      }
      return;
    }
    const request = ++epoch;
    placement = { source, position: hit.position };
    draft = null;
    $('drop-summary').textContent =
      `${entries.find(p => p.offset === source)?.name} → ${hit.position.join(' · ')} (${hit.mode === 'surface' ? 'visible surface' : 'horizontal plane'}).`;
    $('drop-review').replaceChildren();
    $('drop-details').hidden = true;
    $('drop-status').textContent = 'Finding compatible slots…';
    $('drop-target').replaceChildren(new Option('Choose a slot…', ''));
    dialog.showModal();
    updateConfirm();
    try {
      const b = await api('/api/placement/' + source);
      if (request !== epoch) return;
      for (const t of b.replace_targets)
        $('drop-target').add(
          new Option(`${t.name} · ${t.layers.join(', ') || 'Unlayered'} · #${t.offset.toString(16)}`, String(t.offset)),
        );
      $('drop-status').textContent = b.replace_targets.length
        ? 'Choose the object that will give its slot to the copy.'
        : 'No compatible slot.';
    } catch (err) {
      if (request === epoch) $('drop-status').textContent = err.message;
    }
  }
  $('drop-target').addEventListener('change', async () => {
    const request = ++epoch;
    draft = null;
    updateConfirm();
    $('drop-review').replaceChildren();
    $('drop-details').hidden = true;
    if (!$('drop-target').value || !placement || blocked()) return;
    $('drop-status').textContent = 'Checking replacement…';
    try {
      const b = await api('/api/catalog/prepare', { ...placement, target: Number($('drop-target').value) });
      if (request !== epoch) return;
      draft = b;
      $('drop-review').innerHTML = b.rules.map(renderRule).join('');
      for (const rule of b.rules.filter(r => r.severity === 'critical')) {
        const label = document.createElement('label'),
          input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.dropAck = rule.id;
        label.style.display = 'block';
        label.append(input, document.createTextNode(' I acknowledge: ' + rule.message));
        $('drop-review').append(label);
      }
      $('drop-json').textContent = JSON.stringify(b.plan, null, 2);
      $('drop-details').hidden = false;
      $('drop-status').textContent = 'Plan ready. Confirming will replace the selected object.';
      updateConfirm();
    } catch (err) {
      if (request === epoch) $('drop-status').textContent = err.message;
    }
  });
  $('drop-review').addEventListener('change', updateConfirm);
  $('drop-confirm').addEventListener('click', async () => {
    if (!draft || blocked() || $('drop-confirm').disabled) return;
    submitting = true;
    updateConfirm();
    $('drop-cancel').disabled = true;
    $('drop-target').disabled = true;
    try {
      const result = await api('/api/catalog/commit', {
        token: draft.token,
        acknowledged: [...$('drop-review').querySelectorAll('[data-drop-ack]:checked')].map(e => e.dataset.dropAck),
      });
      draft = null;
      clearPreview();
      dialog.close();
      await changed(result);
      note('Copy placed. Undo restores the replaced object; save and patch to test in game.');
    } catch (err) {
      draft = null;
      $('drop-status').textContent = err.message;
      note(err.message);
    } finally {
      submitting = false;
      $('drop-cancel').disabled = false;
      $('drop-target').disabled = false;
      lock();
    }
  });
  $('drop-cancel').addEventListener('click', cancel);
  dialog.addEventListener('cancel', e => {
    e.preventDefault();
    cancel();
  });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') cancel();
  });
  window.addEventListener('blur', () => {
    if (pointerDrag || dragging !== null) cancel();
  });
  return { reload, lock, cancel, highlight };
}
