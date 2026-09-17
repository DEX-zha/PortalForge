// The levels of the disc as this editor can open them (feature 006).
//
// A level is named by its disc path. The catalogue is derived from what this machine already holds: the original
// archive extracted under .local/samples, the decoded workspace under .local/workspaces/<name>-all, the runtime
// fixup map captured for that level when there is one, and the direct-entry status. For each level it states what
// the editor can do and on which evidence, so the view can put a reason next to every action it withholds
// instead of a greyed button.
import fs from 'node:fs';
import path from 'node:path';
import { local, root } from '../experiments/run-game.mjs';
import { readManifest } from '../workspace/manifest.mjs';
import { isTutorial } from './levels.mjs';
import { directEntryConfirmed } from './level-entry.mjs';
import { setting } from '../../../dolphin-mcp/config.mjs';

export const LEVEL_DIR = 'level';
const SAMPLES = ['samples', 'DATA', 'files'];
const WORKSPACES = 'workspaces';
const RUNTIME_MAPS = ['dolphin-evidence', 'runtime-maps'];
// The map every tutorial recipe was proven with. It predates the per-level folder and stays where the findings
// and the tests cite it.
const TUTORIAL_MAP = ['dolphin-evidence', 'ptr-scan3-fixups.json'];
const CORPUS = ['docs', 'reports', 'placement-corpus-all-levels.json'];

// Disc paths are compared case-insensitively: the game's own file table is not consistent about case.
export const levelKey = archive =>
  String(archive ?? '')
    .replace(/\\/g, '/')
    .toLowerCase();
export const levelName = archive =>
  path.posix.basename(String(archive ?? '').replace(/\\/g, '/')).replace(/\.bld$/i, '');
// One workspace per level, named after the archive: the layout `extract --decode` produced for all 76 levels.
export const workspaceName = archive => `${levelName(archive).toLowerCase()}-all`;

export const FAMILIES = ['story', 'hub', 'challenge', 'pvp', 'other'];
export function levelFamily(name) {
  if (/^challenge_level_/i.test(name)) return 'challenge';
  if (/^level_hub_/i.test(name)) return 'hub';
  if (/^pvp_level_/i.test(name)) return 'pvp';
  if (/^level_\d/i.test(name)) return 'story';
  return 'other';
}

const listDir = dir => {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
};
const exists = file => !!file && fs.existsSync(file);
const tryManifest = dir => {
  try {
    return readManifest(dir);
  } catch {
    return null;
  }
};

// The runtime fixup maps configured for this machine: { "<disc path>": "<file>" } under `runtime_maps` in
// .local/dolphin-config.json, or the same object as JSON text in PORTALFORGE_RUNTIME_MAPS.
export function configuredRuntimeMaps(read = () => setting('runtime_maps')) {
  let value;
  try {
    value = read();
  } catch {
    return {};
  }
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [archive, file] of Object.entries(value))
    if (typeof file === 'string' && file) out[levelKey(archive)] = file;
  return out;
}

// Where a level's runtime map comes from, by precedence: configured, then the per-level folder, then the tutorial's
// historical map. Null when there is none: reading a level never needs one, rewriting its pointers does.
export function runtimeMapFor(
  archive,
  { localDir = local, repoRoot = root, configured = configuredRuntimeMaps() } = {},
) {
  const key = levelKey(archive);
  const candidates = [];
  if (configured[key]) candidates.push({ file: path.resolve(repoRoot, configured[key]), source: 'config' });
  candidates.push({
    file: path.join(localDir, ...RUNTIME_MAPS, `${levelName(archive).toLowerCase()}.json`),
    source: 'folder',
  });
  if (isTutorial(archive)) candidates.push({ file: path.join(localDir, ...TUTORIAL_MAP), source: 'default' });
  return candidates.find(c => exists(c.file)) ?? null;
}

// Placement counts from the corpus report over every level, so the picker can size a level before opening it.
function corpusCounts(repoRoot) {
  try {
    const report = JSON.parse(fs.readFileSync(path.join(repoRoot, ...CORPUS), 'utf8'));
    return new Map(
      (report.rows ?? []).map(r => [
        String(r.name ?? '')
          .toLowerCase()
          .replace(/-all$/, ''),
        r.placements,
      ]),
    );
  } catch {
    return new Map();
  }
}

// The level entry of a workspace: the one `.bld` inside the archive. An uncompressed entry is its own decoded
// form; a compressed one is decoded only once `decodeWorkspace` has run.
export function levelEntry(dir, manifest) {
  const e = manifest?.entries?.find(x => /\.bld$/i.test(x.name ?? ''));
  if (!e) return null;
  const decoded = e.decoded_file
    ? path.join(dir, e.decoded_file)
    : e.compression === 'NONE'
      ? path.join(dir, e.file)
      : null;
  return { index: e.index, name: e.name, file: decoded, decoded: exists(decoded) };
}

// What the editor can do on a level, each with its confidence and the finding that carries it. Availability
// never comes from a name: it comes from the evidence the project holds for that level.
export function capabilitiesOf({ tutorial = false, runtimeMap = null, directEntry = false } = {}) {
  const map = !!runtimeMap;
  return {
    transform: tutorial
      ? {
          available: true,
          confidence: 'CONFIRMED',
          finding: 'igz.placement.type104-record',
          why: 'moving, rotating and scaling placements is confirmed in game on this level',
        }
      : {
          available: true,
          confidence: 'LIKELY',
          finding: 'level.transform.other-levels',
          why: 'the placement record has the same layout on every level of the disc, but the in-game effect is confirmed on the tutorial only: boot twice before trusting an edit here',
        },
    duplicate: map
      ? {
          available: true,
          confidence: tutorial ? 'CONFIRMED' : 'LIKELY',
          finding: 'level.entity.duplicate-instantiated',
          why: tutorial
            ? 'same-size replacement of a sacrificable slot, confirmed over two boots'
            : 'this level has a runtime map; the same-size replacement recipe is confirmed on the tutorial only',
        }
      : {
          available: false,
          confidence: 'UNKNOWN',
          finding: 'igz.loader.fixup-map',
          why: 'duplicating rewrites pointer words, and which words are pointers is known only from a runtime map: capture one with experiment ptr-scan on this level',
        },
    add:
      tutorial && map
        ? {
            available: true,
            confidence: 'CONFIRMED',
            finding: 'level.prop.native-addition',
            why: 'nine exact sources, eight additions at most, SSPP52 Rev1',
          }
        : {
            available: false,
            confidence: 'UNKNOWN',
            finding: 'level.prop.native-addition',
            why: 'the native addition recipe is anchored on the tutorial and its runtime map; other levels need their own anchor and proof',
          },
    test: tutorial
      ? {
          available: true,
          confidence: 'CONFIRMED',
          finding: null,
          why: 'the automatic macro reaches the tutorial, moves the Skylander and closes Dolphin',
        }
      : {
          available: false,
          confidence: 'UNKNOWN',
          finding: null,
          why: 'no input macro reaches this level: use Normal play and navigate to it yourself',
        },
    direct_entry:
      tutorial && directEntry
        ? {
            available: true,
            confidence: 'CONFIRMED',
            finding: 'level.entry.preload-checkpoint',
            why: 'a pre-load checkpoint skips the menus and re-reads the current patch',
          }
        : {
            available: false,
            confidence: 'UNKNOWN',
            finding: 'level.entry.preload-checkpoint',
            why: 'listed as UNKNOWN in docs/level-entry-status.json: this level needs its own transition and its own proof',
          },
  };
}

function describe(archive, ctx) {
  const name = levelName(archive),
    tutorial = isTutorial(archive);
  const original = path.join(ctx.localDir, ...SAMPLES, ...archive.split('/'));
  const dir = path.join(ctx.workspacesDir, workspaceName(archive));
  const manifest = tryManifest(dir);
  const entry = manifest ? levelEntry(dir, manifest) : null;
  const runtime_map = runtimeMapFor(archive, ctx);
  return {
    archive,
    key: levelKey(archive),
    name,
    family: levelFamily(name),
    tutorial,
    original: { file: original, present: exists(original) },
    workspace: { dir, present: !!manifest, entry },
    runtime_map,
    placements: ctx.counts.get(name.toLowerCase()) ?? null,
    direct_entry: tutorial && ctx.direct ? 'CONFIRMED' : 'UNKNOWN',
    ready: !!entry?.decoded,
    capabilities: capabilitiesOf({ tutorial, runtimeMap: runtime_map, directEntry: ctx.direct }),
  };
}

const byFamilyThenName = (a, b) =>
  FAMILIES.indexOf(a.family) - FAMILIES.indexOf(b.family) || a.name.localeCompare(b.name, 'en', { numeric: true });

export function levelCatalog({
  localDir = local,
  repoRoot = root,
  directEntry = directEntryConfirmed,
  configured = configuredRuntimeMaps(),
} = {}) {
  const samplesDir = path.join(localDir, ...SAMPLES, LEVEL_DIR);
  const workspacesDir = path.join(localDir, WORKSPACES);
  // Disc case comes from the sample file name, which DolphinTool wrote as the disc names it.
  const archives = new Map();
  for (const f of listDir(samplesDir)) {
    if (/\.bld$/i.test(f)) archives.set(levelKey(`${LEVEL_DIR}/${f}`), `${LEVEL_DIR}/${f}`);
  }
  for (const d of listDir(workspacesDir)) {
    if (!d.endsWith('-all')) continue;
    const disc = tryManifest(path.join(workspacesDir, d))?.source?.disc_path;
    if (disc && !archives.has(levelKey(disc))) archives.set(levelKey(disc), disc);
  }
  const ctx = {
    localDir,
    repoRoot,
    workspacesDir,
    configured,
    counts: corpusCounts(repoRoot),
    direct: !!directEntry(),
  };
  const levels = [...archives.values()].map(archive => describe(archive, ctx)).sort(byFamilyThenName);
  return { local: localDir, samples: samplesDir, workspaces: workspacesDir, levels };
}

// A level by disc path, by name with or without `.bld`, or by workspace name; null when none matches.
export function findLevel(catalog, query) {
  const q = levelKey(query).trim();
  if (!q) return null;
  const base = q
    .replace(/^.*\//, '')
    .replace(/\.bld$/, '')
    .replace(/-all$/, '');
  return catalog.levels.find(l => l.key === q) ?? catalog.levels.find(l => l.name.toLowerCase() === base) ?? null;
}

// The names closest to a query that matched nothing: a substring, or a shared prefix long enough to be a typo
// rather than a coincidence (every level name starts with one of four words).
export function suggestLevels(catalog, query, limit = 5) {
  const base = levelKey(query)
    .replace(/^.*\//, '')
    .replace(/\.bld$/, '');
  if (!base) return [];
  const prefix = (a, b) => {
    let n = 0;
    while (n < a.length && n < b.length && a[n] === b[n]) n++;
    return n;
  };
  return catalog.levels
    .map(l => {
      const name = l.name.toLowerCase();
      const score = name.startsWith(base)
        ? base.length + 2
        : name.includes(base)
          ? base.length + 1
          : prefix(name, base);
      return { name: l.name, score };
    })
    .filter(x => x.score >= Math.min(8, base.length))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(x => x.name);
}
