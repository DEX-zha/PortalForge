import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleSet, toggle, showAll, hideAll, layerIndex } from '../src/view/layers.mjs';

// Feature 003 T012. Layer visibility is the primary way a researcher navigates a level, so it is a pure function
// over the placement list: no scene, no browser, testable here.

const P = (offset, layers) => ({ offset, layers });
const level = [P(0x10, ['Plants', 'Level_027_plants.lvl']), P(0x20, ['Plants']), P(0x30, ['Loot']), P(0x40, [])];

test('layers: a placement is visible while at least one of its layers is visible', () => {
  const idx = layerIndex(level);
  let state = showAll(idx);
  assert.deepEqual(
    [...visibleSet(level, state)].sort((a, b) => a - b),
    [0x10, 0x20, 0x30, 0x40],
  );

  state = toggle(state, 'Plants'); // the first placement keeps its second layer
  const v = visibleSet(level, state);
  assert.ok(v.has(0x10), 'still visible through Level_027_plants.lvl');
  assert.ok(!v.has(0x20), 'claimed by Plants alone, so it goes');
  assert.ok(v.has(0x30));

  state = toggle(state, 'Level_027_plants.lvl');
  assert.ok(!visibleSet(level, state).has(0x10), 'now both of its layers are hidden');
});

test('layers: a placement claimed by nothing belongs to (unlayered) and can be reached', () => {
  const idx = layerIndex(level);
  assert.ok(idx.some(l => l.name === '(unlayered)' && l.count === 1));
  let state = hideAll(idx);
  assert.equal(visibleSet(level, state).size, 0, 'hiding everything hides everything, including the unlayered one');
  state = toggle(state, '(unlayered)');
  assert.deepEqual([...visibleSet(level, state)], [0x40], 'and showing that group brings it back');
});

test('layers: the index counts each placement once per layer it claims and is ordered by size', () => {
  const idx = layerIndex(level);
  assert.deepEqual(
    idx.map(l => [l.name, l.count]),
    [
      ['Plants', 2],
      ['(unlayered)', 1],
      ['Level_027_plants.lvl', 1],
      ['Loot', 1],
    ],
  );
  assert.equal(
    idx.reduce((n, l) => n + l.count, 0),
    5,
    'the first placement is counted in both of its layers',
  );
});

test('layers: toggling is pure, so the previous state is never mutated', () => {
  const idx = layerIndex(level);
  const before = showAll(idx);
  const after = toggle(before, 'Loot');
  assert.notEqual(before, after);
  assert.ok(visibleSet(level, before).has(0x30), 'the earlier state still shows Loot');
  assert.ok(!visibleSet(level, after).has(0x30));
});
