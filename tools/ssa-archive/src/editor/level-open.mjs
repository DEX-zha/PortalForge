// Open a level by its disc path (feature 006).
//
// `edit serve` takes a decoded file the user located by hand. This module does the locating: it finds the level in
// the catalogue, extracts the original from the game image when it has never been extracted, decodes the archive
// into the level's workspace when it has never been decoded, picks the level entry by name rather than by index,
// loads the runtime map the catalogue knows for that level, and opens the session. Every step that touches the
// game image is replacement-only and lands under .local/, as the constitution requires.
import fs from 'node:fs';
import path from 'node:path';
import { extractFile } from '../disc/extract.mjs';
import { extractToWorkspace, readManifest, writeManifest } from '../workspace/manifest.mjs';
import { decodeWorkspace } from '../iga/decode.mjs';
import { openSession } from './session.mjs';
import { levelCatalog, findLevel, suggestLevels, levelEntry, capabilitiesOf } from './level-catalog.mjs';
import { directEntryConfirmed } from './level-entry.mjs';
import { TUTORIAL_DISC } from './levels.mjs';
import { setting } from '../../../dolphin-mcp/config.mjs';

const refuse = (error, message, exitCode = 2) => {
  throw Object.assign(new Error(message), { error, exitCode });
};

// An uncompressed level entry is stored padded to the archive alignment; the decoded form the editor opens is the
// exact entry, so it is written out once under the name a decoded entry would have.
function materialiseUncompressed(dir) {
  const manifest = readManifest(dir);
  const e = manifest.entries.find(x => /\.bld$/i.test(x.name ?? ''));
  if (!e || e.decoded_file || e.compression !== 'NONE') return;
  const stored = fs.readFileSync(path.join(dir, e.file));
  e.decoded_file = e.file + '.decoded';
  fs.writeFileSync(path.join(dir, e.decoded_file), stored.subarray(0, e.size));
  writeManifest(dir, manifest);
}

// Makes sure the level's decoded entry exists, extracting and decoding as needed, and returns the entry together
// with the level's voice pack. `game` left undefined reads the configured image; null means there is none.
export async function ensureLevelWorkspace(
  level,
  { localDir, game = undefined, extract = extractFile, log = () => {} } = {},
) {
  const image = game === undefined ? setting('game') : game;
  const samples = path.join(localDir, 'samples');
  let original = level.original.file;
  if (!level.original.present) {
    if (!image)
      refuse(
        'NO_GAME',
        `${level.archive} has not been extracted from the game image, and no image is configured: set "game" in .local/dolphin-config.json or pass --game`,
        3,
      );
    log(`extracting ${level.archive} from the game image`);
    original = (await extract(image, level.archive, samples)).file;
  }
  const dir = level.workspace.dir;
  if (!level.workspace.present) {
    log(`extracting the entries of ${level.archive}`);
    let buf;
    try {
      buf = fs.readFileSync(original);
    } catch (e) {
      refuse('NO_ORIGINAL', `${original} cannot be read: ${e.message}`, 3);
    }
    try {
      extractToWorkspace(buf, { discPath: level.archive, sourceFile: original, outDir: dir });
    } catch (e) {
      refuse('ARCHIVE_INVALID', `${level.archive} is not a valid IGA archive: ${e.message}`);
    }
  }
  materialiseUncompressed(dir);
  let entry = levelEntry(dir, readManifest(dir));
  if (!entry) refuse('NO_LEVEL_ENTRY', `${level.archive} holds no .bld entry, so it has no level to edit`);
  if (!entry.decoded) {
    log(`decoding ${level.archive}`);
    const d = await decodeWorkspace(dir);
    if (d.total && d.decoded < d.total)
      refuse('DECODE_FAILED', `${level.archive}: ${d.decoded}/${d.total} entries decoded; ${d.reason ?? ''}`.trim());
    entry = levelEntry(dir, readManifest(dir));
    if (!entry?.decoded) refuse('DECODE_FAILED', `${level.archive}: the level entry did not decode`);
  }
  // The voice pack is needed only to serve the level under the tutorial's file names; its absence is a reason
  // shown next to direct entry, not a refusal to open.
  let companion = level.companion ?? null;
  if (companion && !companion.present && image) {
    try {
      log(`extracting ${companion.archive} from the game image`);
      companion = { ...companion, file: (await extract(image, companion.archive, samples)).file, present: true };
    } catch (e) {
      log(`voice pack not extracted: ${e.message}`);
    }
  }
  return { ...entry, companion };
}

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

// The session for a level named by disc path or by name. `fixups` is the runtime map: 'auto' takes the one the
// catalogue knows for that level, null opens without one, an object is used as given.
export async function openLevel(query, { catalog = null, fixups = 'auto', game = undefined, deps = {}, log } = {}) {
  const cat = catalog ?? levelCatalog();
  const level = findLevel(cat, query);
  if (!level) {
    const near = suggestLevels(cat, query);
    refuse(
      'NO_SUCH_LEVEL',
      `no level named ${query} among the ${cat.levels.length} of this disc` +
        (near.length ? `; did you mean ${near.join(', ')}?` : ''),
    );
  }
  const entry = await ensureLevelWorkspace(level, { localDir: cat.local, game, log, extract: deps.extract });
  let map = null;
  if (fixups === 'auto') {
    if (level.runtime_map) map = readJson(level.runtime_map.file);
  } else map = fixups;
  let session;
  try {
    session = openSession(entry.file, { archive: level.archive, entry: entry.index, fixups: map, deps });
  } catch (e) {
    refuse('OPEN_REFUSED', e.message, e.exitCode ?? 2);
  }
  const runtime_map = fixups === 'auto' ? level.runtime_map : map ? { file: null, source: 'given' } : null;
  session.level = {
    name: level.name,
    family: level.family,
    tutorial: level.tutorial,
    runtime_map,
    companion: entry.companion,
    // Where the level's files are served when direct entry redirects it onto the tutorial's names.
    redirect: level.tutorial ? null : { archive: TUTORIAL_DISC.archive, companion: TUTORIAL_DISC.companion },
    capabilities: capabilitiesOf({
      tutorial: level.tutorial,
      runtimeMap: runtime_map,
      directEntry: (deps.directEntry ?? directEntryConfirmed)(),
      companion: !!entry.companion?.present,
    }),
  };
  return session;
}
