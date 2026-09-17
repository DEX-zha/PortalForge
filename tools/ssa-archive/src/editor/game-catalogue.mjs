// Every kind of object of the game, and the levels that hold it (feature 007, phase P).
//
// One pass over the decoded levels: for each level, its records grouped by kind (object-kinds.mjs), with how many
// there are, whether the level stores a template of it, the record to add from, and the folder it files under.
// The result is what the Project tab's "Whole game" scope shows, and what tells how much of "any object in any
// level" needs no import at all: a kind present in the open level is added from that level's own record.
//
// The catalogue is derived from game data, so it lives under .local/ and is never committed. Each level's part
// carries the digest of the level it was read from; a level whose digest changed is read again, the others are
// kept. Nothing in it can be read as another level's: a record is always (level, offset).
import fs from 'node:fs';
import path from 'node:path';
import { local } from '../experiments/run-game.mjs';
import { sceneRoles } from './scene-roles.mjs';
import { folderOf, kindOf, libraryOf } from './object-kinds.mjs';

export const CATALOGUE_VERSION = 2;
export const catalogueFile = path.join(local, 'catalogue', 'kinds.json');

// The kinds of one open level. The record to add from is a stored template when the level has one (the game
// clones templates itself), else the first record in file order.
export function kindsOfLevel(session) {
  const templates = new Set(sceneRoles(session).map(role => role.offset));
  const kinds = new Map();
  for (const placement of session.placements) {
    if (placement.native_addition) continue;
    const kind = kindOf(placement);
    const entry = kinds.get(kind.key) ?? {
      key: kind.key,
      name: kind.name,
      model: kind.model,
      script: kind.script,
      folder: folderOf(placement),
      libraries: [],
      records: 0,
      templates: 0,
      offset: placement.offset,
      from_template: false,
    };
    entry.records++;
    const library = libraryOf(placement);
    if (library && !entry.libraries.includes(library)) entry.libraries.push(library);
    if (templates.has(placement.offset)) {
      entry.templates++;
      // The first template names the kind: its name is the authored one, and it is what the game clones.
      if (!entry.from_template)
        Object.assign(entry, { offset: placement.offset, name: kind.name, from_template: true });
    }
    kinds.set(kind.key, entry);
  }
  return [...kinds.values()];
}

export function readCatalogue(file = catalogueFile) {
  try {
    const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    return stored.version === CATALOGUE_VERSION ? stored : null;
  } catch {
    return null;
  }
}

// Reads every level that `levels` lists and `open` can open. A level whose digest is already in the stored
// catalogue is not opened again unless its digest differs; a level that cannot be opened is recorded with the
// reason, so a missing workspace is visible rather than silently absent.
export async function buildCatalogue({
  levels,
  open,
  file = catalogueFile,
  previous = readCatalogue(file),
  log = () => {},
}) {
  const catalogue = { version: CATALOGUE_VERSION, built: new Date().toISOString(), levels: {} };
  for (const level of levels) {
    try {
      const session = await open(level);
      const kept = previous?.levels?.[session.archive];
      if (kept?.sha256 === session.original_sha256 && kept.kinds) {
        catalogue.levels[session.archive] = kept;
        continue;
      }
      const kinds = kindsOfLevel(session);
      catalogue.levels[session.archive] = {
        name: level.name,
        family: level.family ?? null,
        sha256: session.original_sha256,
        records: session.placements.length,
        kinds,
      };
      log(`${level.name}: ${session.placements.length} records, ${kinds.length} kinds`);
    } catch (e) {
      catalogue.levels[level.archive ?? level.name] = { name: level.name, error: e.message };
      log(`${level.name}: ${e.message}`);
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(catalogue));
  return catalogue;
}

// The catalogue as the open level sees it: one row per kind, with the levels that hold it, and `here` when the
// open level holds it too, naming this level's record to add from. A kind that is not here carries no offset at
// all: nothing of another level can be dragged into a scene.
export function libraryFor(archive, catalogue) {
  if (!catalogue) return { status: 'missing', kinds: [] };
  const kinds = new Map();
  for (const [levelArchive, level] of Object.entries(catalogue.levels)) {
    for (const kind of level.kinds ?? []) {
      const row = kinds.get(kind.key) ?? {
        key: kind.key,
        name: kind.name,
        model: kind.model,
        script: kind.script,
        folder: kind.folder,
        levels: [],
        here: null,
      };
      row.levels.push({ archive: levelArchive, name: level.name, records: kind.records, templates: kind.templates });
      if (levelArchive === archive) {
        row.here = { offset: kind.offset, records: kind.records, templates: kind.templates };
        // Seen from the open level, a kind is filed and named as this level files and names it.
        Object.assign(row, { folder: kind.folder, name: kind.name });
      }
      kinds.set(kind.key, row);
    }
  }
  const rows = [...kinds.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  return {
    status: 'ready',
    built: catalogue.built,
    levels: Object.values(catalogue.levels).filter(level => level.kinds).length,
    here: rows.filter(row => row.here).length,
    elsewhere: rows.filter(row => !row.here).length,
    kinds: rows,
  };
}
