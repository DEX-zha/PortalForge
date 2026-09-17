// A pre-load checkpoint is reusable only with the same virtual disc layout.
// Never restore a resident level to preview a newly rebuilt archive.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { local, defaultScript, readScript, profileLog } from '../experiments/run-game.mjs';
import { felk, profile, bridgeCall } from '../../../dolphin-mcp/runtime.mjs';
import { sha256 as hash } from '../util/hash.mjs';
export const ENTRY_VERSION = 1;
export const TUTORIAL = 'level/level_027_tutorial.bld';
const directory = path.join(local, 'level-entry');
const slot = 8,
  slotFile = path.join(profile, 'StateSaves/SSPP52.s08');
export function directEntryConfirmed() {
  try {
    const f = JSON.parse(
      fs.readFileSync(path.join(local, '../docs/findings/records/level.entry.preload-checkpoint.json')),
    );
    return f.confidence === 'CONFIRMED' && f.editable === true;
  } catch {
    return false;
  }
}
export function validateSkipIntro(archive, mode, skipIntro = false) {
  if (typeof skipIntro !== 'boolean') throw Error('skip_intro must be a boolean.');
  if (skipIntro && (archive?.toLowerCase() !== TUTORIAL || !['test', 'direct-test', 'direct-play'].includes(mode)))
    throw Error('Skip opening cinematic is available only for automated tutorial launches.');
}
export function validateEntryManifest(m, { archive, binding, stateHash }) {
  const fst = m?.fst;
  const validFst =
    !!fst &&
    Number.isInteger(fst.address) &&
    Number.isInteger(fst.length) &&
    fst.address >= 0x80003000 &&
    fst.length >= 12 &&
    fst.length <= 0x200000 &&
    fst.address + fst.length <= 0x81800000 &&
    /^[a-f0-9]{64}$/.test(fst.sha256 ?? '');
  return (
    !!m &&
    validFst &&
    m.version === ENTRY_VERSION &&
    m.archive === archive?.toLowerCase() &&
    m.phase === 'before-level-load' &&
    m.clean_native === true &&
    m.state_sha256 === stateHash &&
    Object.keys(binding).every(k => m.binding?.[k] === binding[k])
  );
}
export function tutorialSteps({ direct = false, skipIntro = false, interactive = false } = {}) {
  const steps = readScript(defaultScript);
  if (skipIntro) {
    const start = steps.findIndex(s => s.shot === 'intro-cinematic') - 1,
      end = steps.findIndex(s => s.shot === 'tutorial-hugo-1');
    if (start < 0 || end <= start) throw Error('Tutorial opening sequence is unavailable.');
    // C is ignored before the opening starts. Wait for the tutorial archive and
    // its dialogue, then ask the game to skip once; never restore a loaded level.
    steps.splice(
      start,
      end - start,
      { wait_monitor: 'level/Level_027_Tutorial.arc', timeout: 240 },
      { wait: 15 },
      { nunchuk: { C: true }, frames: 60 },
      { wait: 5 },
      { shot: 'intro-skipped' },
    );
  }
  const result = direct ? steps.slice(23) : steps;
  if (direct) result[0] = { press: 'A', frames: 60 };
  if (interactive) {
    const end = result.findIndex(s => s.shot === 'tutorial-skylander');
    if (end < 0) throw Error('Tutorial control handoff is unavailable.');
    return result.slice(0, end + 1);
  }
  return result;
}
export function entrySteps(archive = TUTORIAL, options = {}) {
  if (archive.toLowerCase() !== TUTORIAL)
    throw Error('Direct entry is not yet validated for this level. Choose normal play.');
  return tutorialSteps({ ...options, direct: true });
}
const fileHash = async file => {
  const h = createHash('sha256');
  for await (const b of fs.createReadStream(file)) h.update(b);
  return h.digest('hex');
};
async function entryBinding(patch, figure) {
  const descriptor = JSON.parse(fs.readFileSync(patch.descriptor, 'utf8'));
  const game = descriptor['base-file'];
  if (!game) throw Error('Direct entry requires a game-mod descriptor.');
  // Full game hashes are cached by file identity for repeated local previews.
  fs.mkdirSync(directory, { recursive: true });
  const stamp = fs.statSync(game),
    cacheFile = path.join(directory, 'game-hash.json');
  let cache;
  try {
    cache = JSON.parse(fs.readFileSync(cacheFile));
  } catch {
    // No cache yet, or an unreadable one: the hash is recomputed below.
  }
  const identity = [path.resolve(game), stamp.size, stamp.mtimeMs, stamp.ctimeMs];
  if (JSON.stringify(cache?.identity) !== JSON.stringify(identity)) {
    cache = { identity, hash: await fileHash(game) };
    fs.writeFileSync(cacheFile, JSON.stringify(cache));
  }
  const settings = fs.readFileSync(path.join(profile, 'Config/Dolphin.ini'), 'utf8');
  const relevant = settings
    .split(/\r?\n/)
    .filter(l =>
      /^\s*(CPUCore|MMU|CPUThread|SyncGPU|Fastmem|Overclock|EnableOverclock|RAMOverrideEnable|MEM1Size|MEM2Size)\s*=/.test(
        l,
      ),
    )
    .sort();
  const replacements =
    patch.replacements ??
    JSON.parse(fs.readFileSync(path.join(path.dirname(patch.descriptor), 'patch.json'))).replacements;
  if (replacements.length !== 1 || replacements[0].disc_path.toLowerCase() !== TUTORIAL)
    throw Error('Direct entry currently requires a tutorial-only archive patch.');
  return {
    game: cache.hash,
    runtime: await fileHash(felk),
    bridge: await fileHash(path.join(local, '../tools/dolphin-mcp/bridge.py')),
    figure: await fileHash(figure),
    configuration: hash(JSON.stringify(relevant)),
    layout: hash(
      JSON.stringify(
        replacements
          .map(r => [r.disc_path, fs.statSync(path.resolve(path.dirname(patch.descriptor), r.file)).size])
          .sort(),
      ),
    ),
  };
}
export async function readEntryFst(
  read = async (a, n) => Buffer.from(await bridgeCall('memory.read_bytes', [a, n]), 'hex'),
) {
  const header = await read(0x80000038, 8),
    address = header.readUInt32BE(0),
    length = header.readUInt32BE(4);
  if (address < 0x80003000 || length < 12 || length > 0x200000 || address + length > 0x81800000)
    throw Error('Invalid native disc file table.');
  const h = createHash('sha256');
  for (let at = 0; at < length; at += 65536) h.update(await read(address + at, Math.min(65536, length - at)));
  return { address, length, sha256: h.digest('hex') };
}
export async function ensureLevelEntry({ game, patch, archive, figure, onProgress = () => {} }) {
  entrySteps(archive);
  const binding = await entryBinding(patch, figure),
    key = hash(JSON.stringify(binding));
  const folder = path.join(directory, key),
    file = path.join(folder, 'before-load.sav'),
    manifestFile = path.join(folder, 'entry.json');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile));
    if (validateEntryManifest(manifest, { archive, binding, stateHash: await fileHash(file) }))
      return { ...manifest, file };
  } catch {
    // A missing or invalid manifest means the checkpoint has to be prepared again.
  }
  fs.mkdirSync(folder, { recursive: true });
  const previous = fs.existsSync(slotFile) ? fs.readFileSync(slotFile) : null;
  let stop;
  let stillRunning;
  const settingsFile = path.join(profile, 'GameSettings/SSPP52.ini');
  if (fs.existsSync(settingsFile) && /^\s*\[Gecko/m.test(fs.readFileSync(settingsFile, 'utf8')))
    throw Error('Prepare direct entry without existing Gecko codes in the research profile.');
  try {
    onProgress({ phase: 'preparing-entry' });
    await game.launch(patch.descriptor, 'prepare-direct-entry');
    // Capture only with pristine hook instructions and no installed native recipe.
    for (const [address, expected] of [
      [0x800445c8, 0x7c7d1b78],
      [0x80062b88, 0x7f03c378],
    ]) {
      const word = Number(await bridgeCall('memory.read_u32', [address]));
      if (word !== expected) throw Error('Direct entry preparation requires an unmodified native hook.');
    }
    const trace = await game.runScriptSafe(readScript(defaultScript).slice(0, 23), {
      figure,
      labelPrefix: 'prepare-direct-' + Date.now(),
      onStep: s => onProgress({ phase: 'preparing-entry', step: s.step + 1, steps: 23 }),
    });
    if (game.monitorLines('level/Level_027_Tutorial.bld').length) throw Error('Cannot cache an already loaded level.');
    for (const [address, expected] of [
      [0x800445c8, 0x7c7d1b78],
      [0x80062b88, 0x7f03c378],
    ])
      if (Number(await bridgeCall('memory.read_u32', [address])) !== expected)
        throw Error('Native hooks changed during checkpoint preparation.');
    const fst = await readEntryFst();
    const saved = await game.saveState(slot);
    fs.copyFileSync(saved.filename, file);
    manifest = {
      version: ENTRY_VERSION,
      archive: archive.toLowerCase(),
      phase: 'before-level-load',
      clean_native: true,
      binding,
      fst,
      state_sha256: await fileHash(file),
      created: new Date().toISOString(),
      trace,
    };
  } finally {
    stop = await game.stop();
    // The slot file is only restored once Dolphin is known to be gone: a live instance may still write to it.
    stillRunning = (stop && !stop.stopped) || (manifest && !stop?.stopped);
    if (!stillRunning) {
      if (previous) fs.writeFileSync(slotFile, previous);
      else if (fs.existsSync(slotFile)) fs.unlinkSync(slotFile);
    }
  }
  if (stillRunning) throw new Error('Entry preparation did not stop Dolphin; checkpoint is not published.');
  fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, stop }, null, 2));
  return { ...manifest, file };
}
export async function restoreLevelEntry(game, entry, figure) {
  const fresh = await readEntryFst();
  if (fresh.sha256 !== entry.fst.sha256 || fresh.length !== entry.fst.length)
    throw Error('Direct entry disc layout changed. Rebuild the entry checkpoint before retrying.');
  const previous = fs.existsSync(slotFile) ? fs.readFileSync(slotFile) : null;
  const restore = () => {
    if (previous) fs.writeFileSync(slotFile, previous);
    else if (fs.existsSync(slotFile)) fs.unlinkSync(slotFile);
  };
  fs.mkdirSync(path.dirname(slotFile), { recursive: true });
  fs.copyFileSync(entry.file, slotFile);
  try {
    await game.waitSeconds(10);
    await game.loadFigure(figure, 1);
    await game.loadState(slot);
    await game.waitSeconds(5);
    const restored = await readEntryFst();
    if (restored.sha256 !== fresh.sha256) throw Error('Restored disc file table does not match the active patch.');
    await game.json('dolphin_connect_wiimote', { port: 0 });
    // Every consumption check starts after restoration and before the transition.
    game.logOffset = fs.statSync(profileLog).size;
    return {
      restore,
      proof: {
        version: ENTRY_VERSION,
        state_sha256: entry.state_sha256,
        fst: restored,
        binding: entry.binding,
        transition_after: new Date().toISOString(),
      },
    };
  } catch (e) {
    e.restoreEntry = restore;
    throw e;
  }
}
