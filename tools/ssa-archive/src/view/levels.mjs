// The Level tab and the header picker (feature 006): every level of the disc, what this machine holds for it,
// what the editor can do there and on which evidence, and Open. The server owns the switch: this controller
// sends one request and reloads the page, so nothing on this side is torn down by hand. The pure parts, the
// filter and the chips, are unit tested; the rest only connects them to the DOM and to the API.

export const FAMILY_LABELS = { story: 'Story', hub: 'Hub', challenge: 'Challenge', pvp: 'PvP', other: 'Other' };
export const CAPABILITY_LABELS = {
  transform: 'Move / rotate / scale',
  duplicate: 'Duplicate',
  add: 'Add',
  test: 'Automatic test',
  direct_entry: 'Direct entry',
};

const esc = s =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');

// Levels matching a search and a family. The search looks at the name and the disc path, word by word.
export function filterLevels(levels, query = '', family = 'all') {
  const words = String(query).toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return levels.filter(
    l =>
      (family === 'all' || l.family === family) &&
      words.every(w => `${l.name} ${l.archive}`.toLocaleLowerCase().includes(w)),
  );
}

// One chip per capability: a short label and a class that says how far the evidence goes. The full reason
// travels in the title, so a chip is never the whole story.
export function chip(key, c) {
  if (!c) return { text: CAPABILITY_LABELS[key] ?? key, cls: 'withheld', title: '' };
  const title = `${c.why ?? ''}${c.finding ? ` (${c.finding})` : ''}`;
  const short = { transform: 'Move', duplicate: 'Duplicate', add: 'Add', test: 'Test', direct_entry: 'Direct entry' }[
    key
  ];
  if (!c.available) {
    const why = { duplicate: 'no map', add: 'tutorial only', test: 'manual', direct_entry: 'no' }[key];
    return { text: why ? `${short} · ${why}` : short, cls: 'withheld', title };
  }
  if (c.experimental) return { text: `${short} · experimental`, cls: 'experimental', title };
  if (c.confidence === 'CONFIRMED') return { text: key === 'test' ? 'Test macro' : short, cls: 'proven', title };
  return { text: `${short} · ${String(c.confidence ?? '').toLowerCase()}`, cls: 'likely', title };
}

// The capability rows of the current level, for the Level information panel and the Level tab alike.
export function renderCapabilities(capabilities, { reasons = false } = {}) {
  if (!capabilities) return '';
  const rows = Object.entries(CAPABILITY_LABELS).map(([key, label]) => {
    const v = capabilities[key];
    if (!v) return '';
    const title = esc(v.why) + (v.finding ? ` (${esc(v.finding)})` : '');
    const state = v.available ? esc(v.confidence) + (v.experimental ? ' · experimental' : '') : 'not available';
    // Green is for CONFIRMED only; a LIKELY capability is available but reads as such.
    const cls = !v.available || v.experimental ? 'withheld' : v.confidence === 'CONFIRMED' ? 'proven' : 'likely';
    return (
      `<div class="row"><span class="k">${label}</span><span class="v ${cls}" title="${title}">${state}</span></div>` +
      (reasons ? `<div class="ev level-why">${esc(v.why)}${v.finding ? ` <i>${esc(v.finding)}</i>` : ''}</div>` : '')
    );
  });
  const caveat = Object.values(capabilities).find(v => v.available && v.confidence !== 'CONFIRMED');
  return (
    rows.join('') + (!reasons && caveat ? `<div class="ev" style="padding:4px 12px 8px">${esc(caveat.why)}</div>` : '')
  );
}

function levelState(l) {
  if (l.ready) return 'decoded';
  if (l.workspace?.present) return 'not decoded';
  if (l.original?.present) return 'extracted';
  return 'on disc only';
}

export function bindLevels({ api, note, busy = () => false }) {
  const $ = id => document.getElementById(id);
  let data = { current: null, levels: [], switching: false };

  // The bottom tabs: Project keeps its pane, Level gets its own.
  const tabs = ['project', 'level'];
  const show = tab => {
    $('project-body').hidden = tab !== 'project';
    $('level-pane').hidden = tab !== 'level';
    for (const t of tabs) $('tab-' + t).classList.toggle('on', t === tab);
    $('bottom-tab-note').textContent = tab === 'project' ? 'Level objects' : 'Levels of the disc';
    $('thumbnail-size').closest('label').hidden = tab !== 'project';
  };
  for (const t of tabs) $('tab-' + t).addEventListener('click', () => show(t));

  async function open(archive, discard) {
    if (!archive || busy()) return;
    try {
      note('Opening ' + archive + '…');
      const r = await fetch('/api/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archive, discard }),
      });
      const body = await r.json().catch(() => ({}));
      if (r.status === 409 && body.error === 'UNSAVED_CHANGES') {
        $('open-summary').textContent = body.reason;
        $('open-dialog').dataset.archive = archive;
        return $('open-dialog').showModal();
      }
      if (!r.ok) throw new Error(body.reason ?? body.error ?? r.statusText);
      location.reload();
    } catch (e) {
      note('refused: ' + e.message);
    }
  }
  $('open-cancel').addEventListener('click', () => $('open-dialog').close());
  $('open-discard').addEventListener('click', () => {
    const archive = $('open-dialog').dataset.archive;
    $('open-dialog').close();
    open(archive, true);
  });

  function renderPicker() {
    const picker = $('level-picker');
    picker.replaceChildren();
    for (const [family, label] of Object.entries(FAMILY_LABELS)) {
      const members = data.levels.filter(l => l.family === family);
      if (!members.length) continue;
      const group = document.createElement('optgroup');
      group.label = label;
      for (const l of members) {
        const option = document.createElement('option');
        option.value = l.archive;
        option.textContent =
          l.name +
          (l.placements != null ? ` · ${l.placements}` : '') +
          (l.runtime_map ? ' · map' : '') +
          (l.ready ? '' : ' · decode on open');
        option.selected = !!l.current;
        group.appendChild(option);
      }
      picker.appendChild(group);
    }
    $('level-switch').hidden = !data.switching || !data.levels.length;
  }

  function renderCurrent() {
    const c = data.current;
    const l = data.levels.find(x => x.current) ?? null;
    if (!c) return;
    const rows = [
      ['archive', c.archive],
      ['family', l ? FAMILY_LABELS[l.family] : (c.family ?? '')],
      ['objects', l?.placements ?? ''],
      ['state', l ? levelState(l) : 'opened on a file'],
      ['entry', l?.workspace?.entry ? `#${l.workspace.entry.index} ${l.workspace.entry.name}` : ''],
      ['runtime map', l?.runtime_map ? `yes (${l.runtime_map.source})` : 'none'],
      ['voice pack', l?.companion ? (l.companion.present ? 'extracted' : 'not extracted') : ''],
    ].filter(([, v]) => v !== '' && v != null);
    $('level-current').innerHTML =
      `<h3>${esc(c.name ?? c.archive)}</h3>` +
      rows
        .map(([k, v]) => `<div class="row"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`)
        .join('') +
      `<h4>What this editor can do here</h4>` +
      renderCapabilities(c.capabilities, { reasons: true });
  }

  function renderCards() {
    const rows = filterLevels(data.levels, $('level-search').value, $('level-family').value);
    $('level-count').textContent = `${rows.length} / ${data.levels.length} levels`;
    const fragment = document.createDocumentFragment();
    for (const l of rows) {
      const card = document.createElement('div');
      card.className = 'level-card' + (l.current ? ' current' : '');
      card.dataset.level = l.archive;
      const chips = Object.keys(CAPABILITY_LABELS)
        .map(key => chip(key, l.capabilities?.[key]))
        .map(x => `<span class="chip ${x.cls}" title="${esc(x.title)}">${esc(x.text)}</span>`)
        .join('');
      const facts = [
        l.placements != null ? `${l.placements} objects` : 'objects unknown',
        levelState(l),
        l.runtime_map ? 'runtime map' : null,
        l.companion?.present ? 'voice pack' : null,
      ]
        .filter(Boolean)
        .join(' · ');
      card.innerHTML =
        `<div class="level-name" title="${esc(l.archive)}">${esc(l.name)}</div>` +
        `<div class="level-family">${esc(FAMILY_LABELS[l.family] ?? l.family)} · ${esc(facts)}</div>` +
        `<div class="level-chips">${chips}</div>` +
        `<div class="actions"><span class="level-family">${l.current ? 'current level' : ''}</span>` +
        `<button class="level-open" ${l.current || !data.switching ? 'disabled' : ''}>${l.current ? 'Open' : 'Open'}</button></div>`;
      card.querySelector('.level-open').addEventListener('click', () => open(l.archive, false));
      fragment.append(card);
    }
    $('levels').replaceChildren(fragment);
  }

  async function reload() {
    try {
      data = await api('/api/levels');
    } catch (e) {
      // A server started before this view existed still serves the page from disk but not the new routes: the
      // fix is a restart, and the message has to say so rather than leave "Opening…" on screen.
      const stale = /not served by this editor/.test(e.message);
      const message = stale
        ? 'The running editor server predates the Level tab: save your work, stop it (Ctrl+C) and start it again with `node cli.mjs edit open <level>`.'
        : 'level list unavailable: ' + e.message;
      note(message);
      $('level-current').innerHTML = `<div class="empty">${esc(message)}</div>`;
      $('levels').innerHTML = '';
      return data;
    }
    renderPicker();
    renderCurrent();
    renderCards();
    $('capabilities').innerHTML = renderCapabilities(data.current?.capabilities);
    return data;
  }

  $('level-open').addEventListener('click', () => open($('level-picker').value, false));
  $('level-search').addEventListener('input', renderCards);
  $('level-family').addEventListener('change', renderCards);
  const familySelect = $('level-family');
  for (const [family, label] of Object.entries(FAMILY_LABELS)) {
    const option = document.createElement('option');
    option.value = family;
    option.textContent = label;
    familySelect.appendChild(option);
  }

  return {
    reload,
    show,
    lock(locked) {
      $('level-picker').disabled = !!locked;
      $('level-open').disabled = !!locked;
      for (const b of document.querySelectorAll('.level-card .level-open'))
        b.disabled = !!locked || b.closest('.level-card').classList.contains('current') || !data.switching;
    },
    current: () => data.current,
  };
}
