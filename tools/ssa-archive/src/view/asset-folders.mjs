// Folder navigation of the Project pane. The folder of an entry is decided by the server from the game's own
// data: the library the record was compiled from and the directory of its script (src/editor/object-kinds.mjs).
// Nothing here looks at a display name, and nothing here is ever written into game data.
export const assetFolder = entry =>
  Array.isArray(entry.folder) && entry.folder.length === 2 ? entry.folder : ['Unsorted', entry.category ?? 'Objects'];

export function folderTree(entries) {
  const roots = new Map();
  for (const entry of entries) {
    const [parent, child] = assetFolder(entry);
    if (!roots.has(parent)) roots.set(parent, { name: parent, count: 0, children: new Map() });
    const root = roots.get(parent);
    root.count++;
    root.children.set(child, (root.children.get(child) ?? 0) + 1);
  }
  return [...roots.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .map(r => ({
      ...r,
      children: [...r.children]
        .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
        .map(([name, count]) => ({ name, count })),
    }));
}
export const inFolder = (entry, selected) =>
  !selected.length || selected.every((name, i) => assetFolder(entry)[i] === name);

// The Whole game scope: one card per kind of object. A kind that the open level holds is this level's own entry,
// so it is selected, dragged and verified like any other; a kind held elsewhere is a read-only card that says
// which levels hold it. `entries` are the open level's catalogue entries, by offset.
export function libraryCards(kinds, entries) {
  const byOffset = new Map(entries.map(entry => [entry.offset, entry]));
  return kinds.map(kind => {
    const local = kind.here ? byOffset.get(kind.here.offset) : null;
    if (local)
      return { ...local, name: kind.name, folder: kind.folder, kind: kind.key, levels: kind.levels, here: kind.here };
    const names = kind.levels.map(level => level.name);
    return {
      offset: null,
      kind: kind.key,
      name: kind.name,
      model: kind.model,
      layers: [],
      folder: kind.folder,
      category: 'elsewhere',
      available: false,
      levels: kind.levels,
      here: null,
      reason: `Not in this level. Held by ${names.length} level(s): ${names.slice(0, 12).join(', ')}${names.length > 12 ? '…' : ''}`,
      addition: {
        status: 'elsewhere',
        label: `In ${names.length} level${names.length > 1 ? 's' : ''}`,
        available: false,
      },
    };
  });
}
