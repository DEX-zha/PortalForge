import test from 'node:test';
import assert from 'node:assert/strict';
import { assetFolder, folderTree, inFolder, libraryCards } from '../src/view/asset-folders.mjs';

// The Project pane files each entry where the server said, from the game's own data (object-kinds.mjs). The view
// never decides a folder from a display name.

const entries = [
  { offset: 1, name: 'Barrel', folder: ['Destructibles', 'Spyro_Destructables'], category: 'scripted' },
  { offset: 2, name: 'Barrel', folder: ['This level', 'Props'], category: 'static' },
  { offset: 3, name: 'Elemental_Swarmer', folder: ['Enemies', 'Elemental_Swarmer'], category: 'resource' },
  { offset: 4, name: 'Intro_Elemental_Swarmer(1)', folder: ['Enemies', 'Set-Ups'], category: 'marker' },
];

test('folder navigation partitions every entry once, and two objects of one name stay where their data puts them', () => {
  const original = structuredClone(entries);
  const tree = folderTree(entries);
  assert.equal(
    tree.reduce((n, root) => n + root.count, 0),
    entries.length,
  );
  for (const root of tree)
    assert.equal(
      root.count,
      root.children.reduce((n, child) => n + child.count, 0),
    );
  assert.deepEqual(
    tree.map(root => root.name),
    ['Destructibles', 'Enemies', 'This level'],
  );
  // Two barrels with the same name sit in two folders: the name decided nothing.
  assert.deepEqual(
    entries.filter(e => inFolder(e, ['Destructibles'])).map(e => e.offset),
    [1],
  );
  assert.deepEqual(
    entries.filter(e => inFolder(e, ['Enemies', 'Set-Ups'])).map(e => e.offset),
    [4],
  );
  assert.equal(entries.filter(e => inFolder(e, [])).length, 4);
  assert.deepEqual(entries, original);
});

test('an entry the server gave no folder stays navigable, under its category', () => {
  const e = { name: 'sunflower', model: 'Models/plant_sunflower_whole.mdl', category: 'static' };
  assert.deepEqual(assetFolder(e), ['Unsorted', 'static'], 'no guess is made from the name or the model');
  assert.equal(inFolder(e, assetFolder(e)), true);
  assert.equal(inFolder(e, ['Vegetation', 'Flowers']), false);
});

test('the Whole game scope shows this level’s own entry for a kind it holds, and a read-only card otherwise', () => {
  const kinds = [
    {
      key: 'swarmer',
      name: 'Elemental_Swarmer',
      model: 'ElementalSwarmer.mdl',
      folder: ['Enemies', 'Elemental_Swarmer'],
      levels: [{ name: 'Level_000_Mining' }, { name: 'Level_039_UndeadVolcano' }],
      here: { offset: 3, records: 4, templates: 1 },
    },
    {
      key: 'chompy',
      name: 'Enemy_ChompyNipper',
      model: 'Chompy.mdl',
      folder: ['Enemies', 'Chompy'],
      levels: [{ name: 'Level_027_Tutorial' }, { name: 'Level_001_Castle' }],
      here: null,
    },
  ];
  const level = entries.map(e => ({ ...e, available: true, addition: { status: 'needs_test', label: 'Add' } }));
  const [swarmer, chompy] = libraryCards(kinds, level);
  // Held here: the level's own entry, offset and evidence included, so it is dragged like any other.
  assert.equal(swarmer.offset, 3);
  assert.equal(swarmer.available, true);
  assert.equal(swarmer.addition.label, 'Add');
  assert.equal(swarmer.levels.length, 2);
  // Held elsewhere: no offset at all, so nothing of another level can reach a scene.
  assert.equal(chompy.offset, null);
  assert.equal(chompy.available, false);
  assert.equal(chompy.addition.status, 'elsewhere');
  assert.equal(chompy.addition.label, 'In 2 levels');
  assert.match(chompy.reason, /Level_027_Tutorial, Level_001_Castle/);
  assert.deepEqual(
    folderTree([swarmer, chompy])[0].children.map(c => c.name),
    ['Chompy', 'Elemental_Swarmer'],
  );
});
