// Layer visibility, as pure functions over the placement list (feature 003 T017).
//
// A placement can be claimed by several layers at once, so layers are not a partition and visibility cannot be a
// simple filter on a single key: a placement is visible while ANY of its layers is visible. A placement claimed by
// nothing goes into a synthetic group, so that hiding every named layer can never make an object unreachable.

export const UNLAYERED = '(unlayered)';

const layersOf = p => (p.layers && p.layers.length ? p.layers : [UNLAYERED]);

// Every layer of the level with how many placements claim it, largest first, ties by name so the list is stable.
export function layerIndex(placements) {
  const counts = new Map();
  for (const p of placements) for (const name of layersOf(p)) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Visibility state is a Set of visible layer names. Every operation returns a new Set, so a previous state is
// never mutated and the caller can keep one to compare against.
export const showAll = index => new Set(index.map(l => l.name));
export const hideAll = () => new Set();
export const toggle = (state, name) => {
  const next = new Set(state);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  return next;
};
export const show = (state, name) => {
  const next = new Set(state);
  next.add(name);
  return next;
};
export const hide = (state, name) => {
  const next = new Set(state);
  next.delete(name);
  return next;
};
export const only = (index, name) => new Set(index.some(l => l.name === name) ? [name] : []);

export const isVisible = (placement, state) => layersOf(placement).some(name => state.has(name));

// The offsets to draw. Returned as a Set because the scene looks placements up by offset, not by position.
export function visibleSet(placements, state) {
  const out = new Set();
  for (const p of placements) if (isVisible(p, state)) out.add(p.offset);
  return out;
}
