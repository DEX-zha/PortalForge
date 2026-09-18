import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syntheticLevel } from './helpers/synthetic-level.mjs';
import { openSession } from '../src/editor/session.mjs';
import { startServer } from '../src/editor/server.mjs';
import { catalog } from '../src/editor/catalog.mjs';
import { bareName, contentDirs, folderOf, kindOf, libraryOf } from '../src/editor/object-kinds.mjs';
import { buildCatalogue, kindsOfLevel, libraryFor, readCatalogue } from '../src/editor/game-catalogue.mjs';

// Feature 007, phase P: what an object is across levels, where the Project tab files it, and the game-wide
// catalogue. Everything is read from the record's own data (library layer, script directory, model and script
// files); a display name decides nothing, and a record of another level never gets an offset in this one.

const gates = { gates: () => ({ status: 'PASS' }) };
const record = (name, { layers = [], model = null, script = null } = {}) => ({
  name,
  layers,
  model: model ? { path: `C:/tfb/Content/${model}` } : { path: null },
  behavior: script ? { path: `C:/tfb/Content/${script}` } : null,
});

test('folders come from the library layer and the script directory, never from the name', () => {
  const cases = [
    [
      record('Elemental_Swarmer', {
        layers: ['Enemy_Elemental_Swarmer.lvl'],
        model: 'Models/characters/ElementalSwarmer.mdl',
        script: 'Levels/_Enemies/Elemental_Swarmer/scripts/Enemy_Elemental_Swarmer.ai',
      }),
      ['Enemies', 'Elemental_Swarmer'],
    ],
    [
      record('anything', { layers: ['Enemy_Elemental_Near_common.lvl'], model: 'Models/x.mdl' }),
      ['Enemies', 'Elemental_Near'],
    ],
    [
      record('Intro(1)', { layers: ['Setup_001', 'Enemy_Set-Ups.lvl'], script: 'Levels/_Enemies/scripts/K_Intro.ai' }),
      ['Enemies', 'Set-Ups'],
    ],
    // A placed wall of the level's own layer files with the wall templates, through its script's directory.
    [
      record('MiningWall_1(3)', {
        layers: ['Mining walls'],
        model: 'Models/Objects/Rock1_Full_breakable.mdl',
        script: 'Levels/Includes/GameElement_MiningWalls/Breakable_Rock.ai',
      }),
      ['Game elements', 'MiningWalls'],
    ],
    [
      record('gem', {
        layers: ['Loot'],
        model: 'Models/Objects/Gem.mdl',
        script: 'Levels/Includes/Loot/Placed_Loot.ai',
      }),
      ['Loot and treasure', 'Loot'],
    ],
    [
      record('chest', { layers: ['Treasure_Chest_Tier_6.lvl'], model: 'Models/Objects/chest.mdl' }),
      ['Loot and treasure', 'Treasure_Chest_Tier_6'],
    ],
    [
      record('Barrel', {
        layers: ['Props'],
        model: 'Models/Objects/barrel.mdl',
        script: 'Levels/Includes/Spyro_Destructables/Barrel.ai',
      }),
      ['Destructibles', 'Spyro_Destructables'],
    ],
    [record('snd', { layers: ['Level_000_Sounds.lvl'] }), ['Logic', 'Sounds']],
    [
      record('sunflower', { layers: ['Level_027_plants.lvl'], model: 'Models/Objects/plant.mdl' }),
      ['This level', 'Level_027_plants'],
    ],
    [
      record('hat', { layers: ['HatBoxPickup.lvl'], model: 'Models/Objects/hat_box.mdl' }),
      ['Shared libraries', 'HatBoxPickup'],
    ],
    [record('MineTrain', { layers: ['Props'], model: 'Models/Objects/MineTrain.mdl' }), ['This level', 'Props']],
    [
      record('Level Master', { layers: ['Masters'], script: 'Levels/Level_000/Scripts/Level_Master_000.ai' }),
      ['Logic', 'Masters'],
    ],
    [record('CS_Opening01', {}), ['Logic', 'Unsorted']],
    [record('ghost', { layers: ['Props'], model: 'Models/Objects/inviso.mdl' }), ['Logic', 'Props']],
  ];
  for (const [placement, folder] of cases) assert.deepEqual(folderOf(placement), folder, placement.name);
  // Two records named alike file apart when their data differs.
  assert.notDeepEqual(
    folderOf(cases[6][0]),
    folderOf(record('Barrel', { layers: ['Props'], model: 'Models/Objects/barrel.mdl' })),
  );
  assert.deepEqual(contentDirs('C:\\tfb\\Content\\Levels\\_Enemies\\Chompy\\scripts\\Enemy_Chompy.ai'), [
    'Levels',
    '_Enemies',
    'Chompy',
    'scripts',
  ]);
  assert.equal(libraryOf(cases[2][0]), 'Enemy_Set-Ups.lvl');
});

test('a kind uses model and script paths: instances share it, a name alone never makes two records one kind', () => {
  const swarmer = {
    model: 'Models/characters/ElementalSwarmer.mdl',
    script: 'Levels/_Enemies/Elemental_Swarmer/scripts/Enemy_Elemental_Swarmer.ai',
  };
  const template = kindOf(record('Elemental_Swarmer', { layers: ['Enemy_Elemental_Swarmer.lvl'], ...swarmer }));
  const placed = kindOf(record('Elemental_Swarmer(6)', { layers: ['Enemy_Placement'], ...swarmer }));
  assert.equal(template.key, placed.key, 'a placed instance and the template it was cloned from are one kind');
  assert.deepEqual(
    [template.model, template.script, placed.name],
    ['ElementalSwarmer.mdl', 'Enemy_Elemental_Swarmer.ai', 'Elemental_Swarmer'],
  );
  // Case and the machine-specific installation prefix do not matter; content directories do.
  assert.equal(
    kindOf(record('x', { model: 'models/Characters/elementalswarmer.MDL', script: 'Other/ENEMY_ELEMENTAL_SWARMER.ai' }))
      .key,
    kindOf(record('y', { model: 'MODELS/CHARACTERS/ELEMENTALSWARMER.mdl', script: 'other/enemy_elemental_swarmer.AI' }))
      .key,
  );
  assert.equal(
    kindOf(record('x', { ...swarmer })).key,
    kindOf({
      ...record('x', { ...swarmer }),
      model: { path: `D:/another-install/Content/${swarmer.model}` },
      behavior: { path: `D:/another-install/Content/${swarmer.script}` },
    }).key,
  );
  assert.notEqual(
    kindOf(record('Setup', { script: 'Levels/Level_000/Scripts/K_Setup_001_Trigger.ai' })).key,
    kindOf(record('Setup', { script: 'Levels/Level_010/Scripts/K_Setup_001_Trigger.ai' })).key,
    'same script file name in two level directories is two different kinds',
  );
  assert.notEqual(kindOf(record('Elemental_Swarmer', { model: swarmer.model })).key, template.key);
  // Same name, different data: different kinds.
  assert.notEqual(
    kindOf(record('Barrel', { model: 'Models/a.mdl' })).key,
    kindOf(record('Barrel', { model: 'Models/b.mdl' })).key,
  );
  // Records with neither model nor script are kept apart by their bare name instead of merging into one kind.
  assert.notEqual(kindOf(record('CS_Opening01')).key, kindOf(record('CS_Closing01')).key);
  assert.equal(kindOf(record('Marker(2)')).key, kindOf(record('Marker (7)')).key);
  assert.equal(bareName('Barrel(12)'), 'Barrel');
});

function level(t, archive) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-kinds-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'level.decoded');
  fs.writeFileSync(file, syntheticLevel().buf);
  return { dir, session: openSession(file, { archive, entry: 3, deps: gates }) };
}

test('every entry of the level catalogue carries its folder and its kind', t => {
  const { session } = level(t, 'level/Level_000_Mining.bld');
  const entries = catalog(session).entries;
  assert.ok(entries.length > 0);
  for (const entry of entries) {
    assert.equal(entry.folder.length, 2);
    assert.match(entry.kind, /^[0-9a-f]{16}$/);
  }
  // The two crates and the barrel of the synthetic level share a model and have no script: one kind, three records.
  const kinds = kindsOfLevel(session);
  const crate = kinds.find(k => k.model === 'crate.mdl');
  assert.equal(crate.records, 3);
  assert.equal(
    kinds.reduce((n, k) => n + k.records, 0),
    session.placements.length,
  );
});

test('the game catalogue names each level’s records apart, reuses what did not change, and shows what is held here', async t => {
  const mining = level(t, 'level/Level_000_Mining.bld');
  const castle = level(t, 'level/Level_001_Castle.bld');
  // Castle alone holds a Chompy: same offsets as Mining's records, another level.
  castle.session.placements[1].model = { path: 'C:/tfb/Content/Models/characters/Chompy.mdl', offset: 4340 };
  castle.session.placements[1].behavior = {
    path: 'C:/tfb/Content/Levels/_Enemies/Chompy/scripts/Enemy_Chompy.ai',
    offset: 12,
  };
  castle.session.placements[1].name = 'Enemy_ChompyNipper';
  const sessions = { Level_000_Mining: mining.session, Level_001_Castle: castle.session };
  const levels = [
    { name: 'Level_000_Mining', family: 'story' },
    { name: 'Level_001_Castle', family: 'story' },
    { name: 'Title', family: 'other', archive: 'level/Title.bld' },
  ];
  const opened = [];
  const open = async entry => {
    opened.push(entry.name);
    if (!sessions[entry.name]) throw Error('carries no placement class');
    return sessions[entry.name];
  };
  const file = path.join(mining.dir, 'catalogue', 'kinds.json');
  const built = await buildCatalogue({ levels, open, file, previous: null });
  assert.deepEqual(Object.keys(built.levels), [
    'level/Level_000_Mining.bld',
    'level/Level_001_Castle.bld',
    'level/Title.bld',
  ]);
  assert.match(
    built.levels['level/Title.bld'].error,
    /no placement class/,
    'a level that cannot be read is named, not dropped',
  );
  assert.deepEqual(readCatalogue(file).levels['level/Level_000_Mining.bld'].sha256, mining.session.original_sha256);

  const fromMining = libraryFor('level/Level_000_Mining.bld', built);
  assert.equal(fromMining.status, 'ready');
  assert.equal(fromMining.levels, 2);
  const chompy = fromMining.kinds.find(k => k.model === 'Chompy.mdl');
  assert.equal(chompy.here, null, 'Mining does not hold it');
  assert.deepEqual(
    chompy.levels.map(l => l.name),
    ['Level_001_Castle'],
  );
  assert.deepEqual(chompy.folder, ['Enemies', 'Chompy']);
  assert.equal(Object.hasOwn(chompy, 'offset'), false, 'a kind held elsewhere has no offset to drag');
  const crate = fromMining.kinds.find(k => k.model === 'crate.mdl');
  assert.equal(crate.here.offset, mining.session.placements[0].offset, 'held here: this level’s own record');
  assert.equal(crate.levels.length, 2);
  // Seen from Castle, the same kind points at Castle's record, which happens to have the same offset: the level
  // is what tells them apart.
  const fromCastle = libraryFor('level/Level_001_Castle.bld', built);
  assert.ok(fromCastle.kinds.find(k => k.model === 'Chompy.mdl').here);
  assert.equal(libraryFor('level/Level_000_Mining.bld', null).status, 'missing');

  // A second build keeps the levels whose digest did not change: only what could not be read is reported again.
  const lines = [];
  const again = await buildCatalogue({ levels, open, file, log: line => lines.push(line) });
  assert.deepEqual(lines, ['Title: carries no placement class']);
  assert.deepEqual(again.levels['level/Level_001_Castle.bld'], built.levels['level/Level_001_Castle.bld']);
});

test('the editor serves the library against the open level, and builds it on request', async t => {
  const { session, dir } = level(t, 'level/Level_000_Mining.bld');
  const catalogueFile = path.join(dir, 'kinds.json');
  const served = await startServer({
    session,
    port: 0,
    deps: {
      catalogueFile,
      levels: async () => ({ levels: [{ name: 'Level_000_Mining', family: 'story', ready: true }] }),
      open: async () => session,
    },
  });
  t.after(() => served.close());
  const get = async route => (await fetch(served.url + route)).json();
  assert.equal((await get('/api/library')).status, 'missing');
  const built = await (await fetch(served.url + '/api/library', { method: 'POST', body: '{}' })).json();
  assert.equal(built.status, 'ready');
  assert.equal(built.elsewhere, 0);
  assert.equal(built.here, built.kinds.length);
  assert.deepEqual(await get('/api/library'), built);
});
