import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildArchive } from './helpers/synthetic.mjs';
import { syntheticLevel, syntheticFixups } from './helpers/synthetic-level.mjs';
import { levelCatalog, findLevel } from '../src/editor/level-catalog.mjs';
import { openLevel, ensureLevelWorkspace } from '../src/editor/level-open.mjs';

// Feature 006 T006. Opening by disc path does the locating a person used to do by hand, and refuses with a
// named reason at each step it cannot complete. A synthetic archive with an uncompressed `level.bld` entry
// stands in for the disc: no game data, no LZMA, and the same manifest the real extraction writes.

const gates = { gates: () => ({ status: 'PASS' }) };

function machine() {
  const localDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-open-'));
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-open-repo-'));
  const level = syntheticLevel();
  const archive = buildArchive([
    { name: 'level.bld', data: level.buf },
    { name: 'ENGLISH.pak', data: Buffer.alloc(48, 7) },
  ]);
  const sample = path.join(localDir, 'samples', 'DATA', 'files', 'level', 'Level_000_Mining.bld');
  fs.mkdirSync(path.dirname(sample), { recursive: true });
  fs.writeFileSync(sample, archive.buf);
  const catalog = () => levelCatalog({ localDir, repoRoot, directEntry: () => false, configured: {} });
  return { localDir, repoRoot, level, archive, sample, catalog };
}

test('an unknown level is refused by name, with the closest names offered', async () => {
  const m = machine();
  await assert.rejects(
    () => openLevel('Level_000_Minig', { catalog: m.catalog(), deps: gates }),
    e => e.error === 'NO_SUCH_LEVEL' && /did you mean Level_000_Mining/.test(e.message),
  );
});

test('a level never extracted and no game image is a refusal, not a DolphinTool call', async () => {
  const m = machine();
  const cat = m.catalog();
  cat.levels.push({
    ...findLevel(cat, 'Level_000_Mining'),
    archive: 'level/Level_001_Castle.bld',
    key: 'level/level_001_castle.bld',
    name: 'Level_001_Castle',
    original: { file: path.join(m.localDir, 'samples/DATA/files/level/Level_001_Castle.bld'), present: false },
    workspace: { dir: path.join(m.localDir, 'workspaces/level_001_castle-all'), present: false, entry: null },
  });
  let called = 0;
  await assert.rejects(
    () =>
      openLevel('Level_001_Castle', {
        catalog: cat,
        game: null,
        deps: { ...gates, extract: () => (called++, null) },
      }),
    e => e.error === 'NO_GAME',
  );
  assert.equal(called, 0);
});

test('the first opening extracts the workspace and materialises the level entry; the second reuses it', async () => {
  const m = machine();
  const logs = [];
  const s = await openLevel('level/Level_000_Mining.bld', {
    catalog: m.catalog(),
    deps: gates,
    log: l => logs.push(l),
  });
  assert.equal(s.archive, 'level/Level_000_Mining.bld');
  assert.equal(s.placements.length, 4);
  assert.equal(s.has_runtime_map, false);
  assert.deepEqual(s.level.capabilities.transform, {
    available: true,
    confidence: 'LIKELY',
    finding: 'level.transform.other-levels',
    why: s.level.capabilities.transform.why,
  });
  assert.equal(s.level.runtime_map, null);
  assert.match(logs.join('\n'), /extracting the entries/);

  const dir = path.join(m.localDir, 'workspaces', 'level_000_mining-all');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const entry = manifest.entries.find(e => e.name === 'level.bld');
  assert.equal(entry.decoded_file, entry.file + '.decoded', 'an uncompressed entry gets its exact decoded form');
  assert.equal(s.entry, entry.index, 'the entry index is read from the manifest, never assumed');
  assert.ok(fs.readFileSync(path.join(dir, entry.decoded_file)).equals(m.level.buf));

  const again = await openLevel('Level_000_Mining', { catalog: m.catalog(), deps: gates, log: l => logs.push(l) });
  assert.equal(again.file, s.file);
  assert.equal(logs.filter(l => /extracting/.test(l)).length, 1, 'nothing is extracted twice');
});

test('the runtime map the catalogue knows for the level is loaded, unless the caller says otherwise', async () => {
  const m = machine();
  const mapFile = path.join(m.localDir, 'dolphin-evidence', 'runtime-maps', 'level_000_mining.json');
  fs.mkdirSync(path.dirname(mapFile), { recursive: true });
  fs.writeFileSync(mapFile, JSON.stringify(syntheticFixups(m.level)));
  const mapped = await openLevel('Level_000_Mining', { catalog: m.catalog(), deps: gates });
  assert.equal(mapped.has_runtime_map, true);
  assert.equal(mapped.level.runtime_map.source, 'folder');
  assert.equal(mapped.level.capabilities.duplicate.available, true);

  const bare = await openLevel('Level_000_Mining', { catalog: m.catalog(), fixups: null, deps: gates });
  assert.equal(bare.has_runtime_map, false);
  assert.equal(bare.level.runtime_map, null);
});

test('a missing original is extracted from the game image through the injected extractor', async () => {
  const m = machine();
  const cat = m.catalog();
  const lvl = findLevel(cat, 'Level_000_Mining');
  const elsewhere = path.join(m.localDir, 'elsewhere.bld');
  fs.renameSync(m.sample, elsewhere);
  lvl.original.present = false;
  const calls = [];
  const extract = async (game, discPath, out) => {
    calls.push({ game, discPath, out });
    const file = path.join(out, 'DATA', 'files', ...discPath.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(elsewhere, file);
    return { file };
  };
  const entry = await ensureLevelWorkspace(lvl, { localDir: m.localDir, game: 'C:/game.wbfs', extract });
  assert.deepEqual(calls, [
    { game: 'C:/game.wbfs', discPath: 'level/Level_000_Mining.bld', out: path.join(m.localDir, 'samples') },
  ]);
  assert.equal(entry.decoded, true);
});

test('an archive that is not IGA, or one without a .bld entry, is refused with its reason', async () => {
  const m = machine();
  fs.writeFileSync(m.sample, Buffer.from('not an archive at all, not even close'));
  await assert.rejects(
    () => openLevel('Level_000_Mining', { catalog: m.catalog(), deps: gates }),
    e => e.error === 'ARCHIVE_INVALID',
  );
  const n = machine();
  fs.writeFileSync(n.sample, buildArchive([{ name: 'ENGLISH.pak', data: Buffer.alloc(32, 1) }]).buf);
  await assert.rejects(
    () => openLevel('Level_000_Mining', { catalog: n.catalog(), deps: gates }),
    e => e.error === 'NO_LEVEL_ENTRY',
  );
});

test('a level entry the editor cannot vouch for is refused as OPEN_REFUSED with the session reason', async () => {
  const m = machine();
  fs.writeFileSync(
    m.sample,
    buildArchive([{ name: 'level.bld', data: Buffer.alloc(256, 0) }]).buf, // zeros: not an IGZ
  );
  await assert.rejects(
    () => openLevel('Level_000_Mining', { catalog: m.catalog(), deps: gates }),
    e => e.error === 'OPEN_REFUSED',
  );
});
