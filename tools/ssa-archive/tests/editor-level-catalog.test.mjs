import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  levelCatalog,
  findLevel,
  suggestLevels,
  levelFamily,
  levelKey,
  levelName,
  workspaceName,
  runtimeMapFor,
  configuredRuntimeMaps,
  capabilitiesOf,
  levelEntry,
} from '../src/editor/level-catalog.mjs';

// Feature 006 T004. The catalogue is derived from the machine, never typed in: a level exists because its
// original or its workspace does, its runtime map because a file does, and every capability it announces names
// the evidence behind it. These tests build a small .local and a small repository from scratch.

function write(file, content = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const manifest = (discPath, { decoded = true, compression = 'LZMA_CHUNKED' } = {}) =>
  JSON.stringify({
    source: { disc_path: discPath },
    entries: [
      { index: 0, name: 'FRENCH.pak', compression, file: 'entries/0-FRENCH.pak', decoded_file: null },
      {
        index: 3,
        name: 'level.bld',
        compression,
        file: 'entries/3-level.bld',
        decoded_file: decoded ? 'entries/3-level.bld.decoded' : null,
      },
    ],
  });

function fixture() {
  const localDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-levels-local-'));
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-levels-repo-'));
  const samples = path.join(localDir, 'samples', 'DATA', 'files', 'level');
  for (const f of [
    'Level_000_Mining.bld',
    'Level_027_Tutorial.bld',
    'Level_027_Tutorial.arc',
    'Challenge_Level_003.bld',
    'PvP_Level_010_Ice.bld',
    'Level_Hub_stage2.bld',
    'Title.bld',
  ])
    write(path.join(samples, f));
  const ws = path.join(localDir, 'workspaces');
  write(path.join(ws, 'level_000_mining-all', 'manifest.json'), manifest('level/Level_000_Mining.bld'));
  write(path.join(ws, 'level_000_mining-all', 'entries', '3-level.bld.decoded'), 'igz');
  write(
    path.join(ws, 'challenge_level_003-all', 'manifest.json'),
    manifest('level/Challenge_Level_003.bld', { decoded: false }),
  );
  // A workspace with no original on disk still names a level of the disc.
  write(
    path.join(ws, 'level_046_dragon_expansion-all', 'manifest.json'),
    manifest('level/Level_046_Dragon_Expansion.bld'),
  );
  write(path.join(ws, 'level_046_dragon_expansion-all', 'entries', '3-level.bld.decoded'), 'igz');
  // Experiment workspaces are not levels, whatever their manifest says.
  write(path.join(ws, 'm2-level_027_tutorial-e3-1', 'manifest.json'), manifest('level/Level_027_Tutorial.bld'));
  write(path.join(localDir, 'dolphin-evidence', 'runtime-maps', 'level_000_mining.json'), '{}');
  write(path.join(localDir, 'dolphin-evidence', 'ptr-scan3-fixups.json'), '{}');
  write(
    path.join(repoRoot, 'docs', 'reports', 'placement-corpus-all-levels.json'),
    JSON.stringify({
      rows: [
        { name: 'level_000_mining-all', placements: 617 },
        { name: 'title-all', placements: 9 },
      ],
    }),
  );
  return { localDir, repoRoot, samples, ws };
}

test('level names, keys, families and workspace names follow the disc', () => {
  assert.equal(levelKey('level\\Level_000_Mining.bld'), 'level/level_000_mining.bld');
  assert.equal(levelName('level/Level_000_Mining.bld'), 'Level_000_Mining');
  assert.equal(workspaceName('level/Level_000_Mining.bld'), 'level_000_mining-all');
  assert.deepEqual(
    ['Level_000_Mining', 'Level_Hub_stage2', 'Challenge_Level_003', 'PvP_Level_010_Ice', 'Title', 'Credits'].map(
      levelFamily,
    ),
    ['story', 'hub', 'challenge', 'pvp', 'other', 'other'],
  );
});

test('the catalogue lists every level the machine holds, sorted by family then name, with its state', () => {
  const { localDir, repoRoot } = fixture();
  const cat = levelCatalog({ localDir, repoRoot, directEntry: () => true, configured: {} });
  assert.deepEqual(
    cat.levels.map(l => l.name),
    [
      'Level_000_Mining',
      'Level_027_Tutorial',
      'Level_046_Dragon_Expansion',
      'Level_Hub_stage2',
      'Challenge_Level_003',
      'PvP_Level_010_Ice',
      'Title',
    ],
    'the .arc is not a level, the experiment workspace is not a level, and the workspace-only level is listed',
  );
  const mining = findLevel(cat, 'Level_000_Mining');
  assert.equal(mining.archive, 'level/Level_000_Mining.bld');
  assert.equal(mining.key, 'level/level_000_mining.bld');
  assert.equal(mining.family, 'story');
  assert.equal(mining.original.present, true);
  assert.equal(mining.workspace.present, true);
  assert.deepEqual(
    { index: mining.workspace.entry.index, name: mining.workspace.entry.name, decoded: mining.workspace.entry.decoded },
    { index: 3, name: 'level.bld', decoded: true },
  );
  assert.equal(mining.ready, true);
  assert.equal(mining.placements, 617, 'from the corpus report');
  assert.equal(mining.runtime_map.source, 'folder');

  const challenge = findLevel(cat, 'Challenge_Level_003');
  assert.equal(challenge.workspace.present, true);
  assert.equal(challenge.ready, false, 'a manifest without a decoded level entry is not ready');
  assert.equal(challenge.runtime_map, null);
  assert.equal(challenge.placements, null);

  const dragon = findLevel(cat, 'Level_046_Dragon_Expansion');
  assert.equal(dragon.original.present, false);
  assert.equal(dragon.ready, true);

  const tutorial = findLevel(cat, 'Level_027_Tutorial');
  assert.equal(tutorial.tutorial, true);
  assert.equal(tutorial.workspace.present, false);
  assert.equal(tutorial.ready, false);
  assert.equal(tutorial.runtime_map.source, 'default', 'the historical ptr-scan3 map is the tutorial default');
  assert.equal(tutorial.direct_entry, 'CONFIRMED');
  assert.equal(mining.direct_entry, 'UNKNOWN');
});

test('a runtime map is found by precedence: configured, then the per-level folder, then the tutorial default', () => {
  const { localDir, repoRoot } = fixture();
  const own = path.join(repoRoot, 'my-map.json');
  write(own, '{}');
  const configured = configuredRuntimeMaps(() => ({ 'level/LEVEL_000_MINING.bld': own }));
  assert.deepEqual(configured, { 'level/level_000_mining.bld': own });
  assert.equal(runtimeMapFor('level/Level_000_Mining.bld', { localDir, repoRoot, configured }).source, 'config');
  assert.equal(runtimeMapFor('level/Level_000_Mining.bld', { localDir, repoRoot, configured: {} }).source, 'folder');
  assert.equal(runtimeMapFor('level/Level_027_Tutorial.bld', { localDir, repoRoot, configured: {} }).source, 'default');
  assert.equal(runtimeMapFor('level/Title.bld', { localDir, repoRoot, configured: {} }), null);
  // A configured file that does not exist is skipped rather than announced.
  const missing = configuredRuntimeMaps(() => ({ 'level/Title.bld': path.join(repoRoot, 'nope.json') }));
  assert.equal(runtimeMapFor('level/Title.bld', { localDir, repoRoot, configured: missing }), null);
  // The environment form is JSON text; anything else reads as no configuration.
  assert.deepEqual(
    configuredRuntimeMaps(() => JSON.stringify({ 'level/Title.bld': 'x.json' })),
    {
      'level/title.bld': 'x.json',
    },
  );
  assert.deepEqual(
    configuredRuntimeMaps(() => 'not json'),
    {},
  );
  assert.deepEqual(
    configuredRuntimeMaps(() => ['x']),
    {},
  );
  assert.deepEqual(
    configuredRuntimeMaps(() => null),
    {},
  );
});

test('capabilities come from the evidence held for the level, and each one names its finding', () => {
  const tutorial = capabilitiesOf({ tutorial: true, runtimeMap: { file: 'm' }, directEntry: true });
  assert.deepEqual(Object.fromEntries(Object.entries(tutorial).map(([k, v]) => [k, v.available])), {
    transform: true,
    duplicate: true,
    add: true,
    test: true,
    direct_entry: true,
  });
  assert.equal(tutorial.transform.confidence, 'CONFIRMED');

  const other = capabilitiesOf({ tutorial: false, runtimeMap: null, directEntry: true });
  assert.deepEqual(Object.fromEntries(Object.entries(other).map(([k, v]) => [k, v.available])), {
    transform: true,
    duplicate: false,
    add: false,
    test: false,
    direct_entry: false,
  });
  assert.equal(other.transform.confidence, 'LIKELY');
  assert.equal(other.transform.finding, 'level.transform.other-levels');
  assert.match(other.duplicate.why, /ptr-scan/);

  const mapped = capabilitiesOf({ tutorial: false, runtimeMap: { file: 'm' }, directEntry: false });
  assert.equal(mapped.duplicate.available, true);
  assert.equal(mapped.duplicate.confidence, 'LIKELY');
  assert.equal(mapped.add.available, false, 'a map alone does not unlock native additions outside the tutorial');

  const unprepared = capabilitiesOf({ tutorial: true, runtimeMap: { file: 'm' }, directEntry: false });
  assert.equal(unprepared.direct_entry.available, false);
  for (const c of Object.values({ ...tutorial, ...other })) {
    assert.equal(typeof c.why, 'string');
    assert.ok(['CONFIRMED', 'LIKELY', 'UNKNOWN'].includes(c.confidence));
  }
});

test('findLevel accepts a disc path, a name with or without .bld, a workspace name, and nothing else', () => {
  const { localDir, repoRoot } = fixture();
  const cat = levelCatalog({ localDir, repoRoot, directEntry: () => false, configured: {} });
  for (const q of [
    'level/Level_000_Mining.bld',
    'LEVEL/level_000_mining.BLD',
    'Level_000_Mining',
    'level_000_mining.bld',
    'level_000_mining-all',
  ])
    assert.equal(findLevel(cat, q)?.name, 'Level_000_Mining', q);
  assert.equal(findLevel(cat, 'Mining'), null, 'a partial name is not a match');
  assert.equal(findLevel(cat, ''), null);
  assert.equal(findLevel(cat, undefined), null);
  assert.deepEqual(suggestLevels(cat, 'mining'), ['Level_000_Mining']);
  assert.deepEqual(suggestLevels(cat, 'level_0', 2), ['Level_000_Mining', 'Level_027_Tutorial']);
});

test('the level entry is the .bld inside the archive; an uncompressed one is its own decoded form', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-entry-'));
  write(path.join(dir, 'entries', '2-level.bld'), 'igz');
  const raw = levelEntry(dir, {
    entries: [
      { index: 0, name: 'ENGLISH.pak', compression: 'NONE', file: 'entries/0-ENGLISH.pak' },
      { index: 2, name: 'level.bld', compression: 'NONE', file: 'entries/2-level.bld', decoded_file: null },
    ],
  });
  assert.deepEqual(raw, { index: 2, name: 'level.bld', file: path.join(dir, 'entries', '2-level.bld'), decoded: true });
  const pending = levelEntry(dir, {
    entries: [{ index: 2, name: 'level.bld', compression: 'LZMA_CHUNKED', file: 'entries/2-level.bld' }],
  });
  assert.deepEqual(pending, { index: 2, name: 'level.bld', file: null, decoded: false });
  assert.equal(levelEntry(dir, { entries: [{ index: 0, name: 'ENGLISH.pak' }] }), null);
  assert.equal(levelEntry(dir, null), null);
});

test('an empty machine yields an empty catalogue rather than an error', () => {
  const localDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-levels-empty-'));
  const cat = levelCatalog({ localDir, repoRoot: localDir, directEntry: () => false, configured: {} });
  assert.deepEqual(cat.levels, []);
});
