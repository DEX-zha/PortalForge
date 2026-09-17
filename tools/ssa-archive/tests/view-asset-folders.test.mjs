import test from 'node:test';
import assert from 'node:assert/strict';
import { assetFolder, folderTree, inFolder } from '../src/view/asset-folders.mjs';

test('folder navigation partitions every entry once without merging instances or changing records', () => {
  const entries = [
    { offset: 1, name: 'sunflower(1)', model: 'Models/plant_sunflower_whole.mdl', category: 'static' },
    { offset: 2, name: 'sunflower(1)', model: 'Models/plant_sunflower_whole.mdl', category: 'resource' },
    { offset: 3, name: 'Barrel', model: 'Models/barrel.mdl', category: 'scripted' },
    { offset: 4, name: 'Unknown', model: null, category: 'marker' },
  ];
  const original = structuredClone(entries),
    tree = folderTree(entries);
  assert.equal(
    tree.reduce((n, r) => n + r.count, 0),
    4,
  );
  for (const root of tree)
    assert.equal(
      root.count,
      root.children.reduce((n, c) => n + c.count, 0),
    );
  assert.deepEqual(
    entries.filter(e => inFolder(e, ['Vegetation', 'Flowers'])).map(e => e.offset),
    [1, 2],
  );
  assert.equal(entries.filter(e => inFolder(e, [])).length, 4);
  assert.deepEqual(entries, original);
});
test('unrecognised models retain a navigable category and folder filtering respects the full path', () => {
  const e = { name: 'unknown', model: 'unclassified.mdl', category: 'static' };
  assert.equal(assetFolder(e).length, 2);
  assert.equal(inFolder(e, assetFolder(e)), true);
  assert.equal(inFolder(e, ['Vegetation', 'Flowers']), false);
});
