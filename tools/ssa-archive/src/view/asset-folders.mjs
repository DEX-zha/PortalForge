// Navigation categories only: never write these inferred labels into game data.
export function assetFolder(entry) {
  const name = `${entry.model ?? ''} ${entry.name ?? ''}`.toLowerCase();
  if (entry.category === 'marker') return ['Markers', /camera|^cs_|cutscene/.test(name) ? 'Cameras and cutscenes' : 'Logic and positions'];
  if (/sunflower|flower|petal/.test(name)) return ['Vegetation', 'Flowers'];
  if (/tree|palm|trunk|stump/.test(name)) return ['Vegetation', 'Trees'];
  if (/weed|plant|grass|bush|vine|fern/.test(name)) return ['Vegetation', 'Plants'];
  if (/bridge|plank|ramp|platform|jumpad/.test(name)) return ['Scenery', 'Bridges and platforms'];
  if (/rock|stone|cliff|island|terrain|shell/.test(name)) return ['Scenery', 'Rocks and terrain'];
  if (/house|building|windmill|tower|roof|wall|fence|gate/.test(name)) return ['Scenery', 'Buildings'];
  if (/coin|treasure|gem|loot|food|apple|chest/.test(name)) return ['Objects', 'Treasure and pickups'];
  if (/barrel|crate|pot|basket|box/.test(name)) return ['Objects', 'Containers'];
  if (/cannon|canon|switch|lever|gear|wheel|push.?block/.test(name)) return ['Objects', 'Mechanisms'];
  if (/chompy|enemy|mabu|hugo|sheep|troll|npc|character/.test(name)) return ['Characters', 'Creatures and characters'];
  if (/vfx|particle|smoke|fire|water|cloud|light|effect/.test(name)) return ['Atmosphere', 'Effects and environment'];
  return ['Other', entry.category === 'scripted' ? 'Scripted objects' : entry.category === 'resource' ? 'Resources' : 'Props'];
}

export function folderTree(entries) {
  const roots = new Map();
  for (const entry of entries) {
    const [parent, child] = assetFolder(entry);
    if (!roots.has(parent)) roots.set(parent, { name: parent, count: 0, children: new Map() });
    const root = roots.get(parent); root.count++;
    root.children.set(child, (root.children.get(child) ?? 0) + 1);
  }
  return [...roots.values()].sort((a,b) => a.name.localeCompare(b.name, 'en')).map(r => ({ ...r, children: [...r.children].sort(([a],[b]) => a.localeCompare(b,'en')).map(([name,count]) => ({name,count})) }));
}
export const inFolder = (entry, selected) => !selected.length || selected.every((name, i) => assetFolder(entry)[i] === name);
