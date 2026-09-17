// Reserving memory for a table of additions outside the Gecko area (feature 007, S08, experiment M1).
//
// The Gecko area leaves 3 256 bytes for codes, which bounds one table at 59 additions when the game is played
// without the editor. The study (specs/007-unlimited-additions/study-add-anything.md) proposes to reserve memory
// the honest way: the game's OS reads the end of usable MEM2 from 0x80003128 when it starts, and Dolphin applies
// Riivolution memory patches once the executable is loaded and before its first instruction. Lowering that word
// takes a block out of everything the OS will ever hand out; a second patch fills the block with a pattern.
//
// This probe boots a level with both patches and reads, at every capture of the level and at the end: the word at
// 0x80003128, and whether the block still holds its pattern. An intact block in a level that plays is what the
// table of S09 needs. A changed block, or a game that does not start, is the answer too.
//
//   node research-probes/arena-reserve-boot.mjs [--level Level_000_Mining] [--kilobytes 256] [--control] [--dry]
//
// --control writes the same pattern without lowering the word: if the game then overwrites the block, the block is
// memory the game uses, and the lowered word is what keeps it out.
//
// One Dolphin boot per invocation. The checkpoint of direct entry is made again for this patch, because what a
// patch writes into memory belongs to the checkpoint's identity: the first boot takes about two minutes more.
import fs from 'node:fs';
import path from 'node:path';
import { openLevel } from '../src/editor/level-open.mjs';
import { redirectFor } from '../src/editor/save.mjs';
import { editorDeps } from '../src/cli/commands/edit.mjs';
import { readNativeBytes } from '../src/editor/native-run.mjs';
import { sha256 as hash } from '../src/util/hash.mjs';
import { local } from '../src/experiments/run-game.mjs';

const MEM2_USABLE_END = 0x80003128; // read by the OS at start-up; 0x935E0000 on this game in Dolphin
const EXPECTED_END = 0x935e0000;
const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const log = line => console.error(new Date().toISOString().slice(11, 19) + ' ' + line);
const hex = n => '0x' + (n >>> 0).toString(16);

const level = arg('--level', 'Level_000_Mining');
const size = Number(arg('--kilobytes', '256')) * 1024;
if (!Number.isInteger(size) || size <= 0 || size % 0x1000) throw new Error('--kilobytes must be a multiple of 4');
const blockAt = EXPECTED_END - size;

// A pattern no allocator writes by accident: the tag and the index of each word.
const block = Buffer.alloc(size);
for (let i = 0; i < size; i += 8) {
  block.writeUInt32BE(0x50465256, i); // 'PFRV'
  block.writeUInt32BE(i, i + 4);
}
const word = Buffer.alloc(4);
word.writeUInt32BE(blockAt);
const control = process.argv.includes('--control');
const memory = [
  ...(control ? [] : [{ offset: MEM2_USABLE_END, value: word.toString('hex') }]),
  { offset: blockAt, bytes: block },
];
log(
  control
    ? `control: ${size / 1024} KB of pattern at ${hex(blockAt)}, usable end left at ${hex(EXPECTED_END)}`
    : `reserve ${size / 1024} KB of MEM2 at ${hex(blockAt)}: usable end ${hex(EXPECTED_END)} -> ${hex(blockAt)}`,
);

const s = await openLevel(level, { log });
const dir = path.join(local, 'level-check');
fs.mkdirSync(dir, { recursive: true });
const unedited = path.join(dir, `arena-${level.toLowerCase()}.decoded`);
fs.writeFileSync(unedited, s.buffer);
if (process.argv.includes('--dry')) process.exit(0);

const deps = editorDeps({});
const built = deps.build({
  experimentId: `arena-${level.toLowerCase()}-${Date.now()}`,
  replacements: [{ disc_path: s.archive, file: unedited }],
  entry: s.entry,
  session: s,
  redirect: redirectFor(s),
  memory,
});
if (!built.redirect) throw new Error('this level cannot be reached automatically: its voice pack is not extracted');
log(`patch ${built.redirect.dir}: ${built.redirect.memory?.length ?? 0} memory patch(es) in the descriptor`);

// What the running game holds: the word the OS read, and the block, compared word for word with the pattern.
const expected = hash(block);
const BRIDGE_READ = 0x10000; // the bridge reads at most 64 KB per call
const readBlock = async () => {
  const parts = [];
  for (let at = 0; at < size; at += BRIDGE_READ)
    parts.push(await readNativeBytes(blockAt + at, Math.min(BRIDGE_READ, size - at)));
  return Buffer.concat(parts);
};
const inspect = async () => {
  const end = (await readNativeBytes(MEM2_USABLE_END, 4)).readUInt32BE(0);
  const seen = await readBlock();
  let changed = 0,
    first = null;
  for (let i = 0; i < size; i += 4)
    if (seen.readUInt32BE(i) !== block.readUInt32BE(i)) {
      changed++;
      first ??= blockAt + i;
    }
  return { usable_end: end, block_intact: hash(seen) === expected, changed_words: changed, first_changed: first };
};

const record = await deps.run({
  session: s,
  patch: built.redirect,
  archive: built.redirect.entry_archive,
  mode: 'direct-test',
  redirect: { level: s.archive, name: s.level?.name ?? null },
  prediction: control
    ? `The level plays as usual; the ${size / 1024} KB below ${hex(EXPECTED_END)} are the game's to use, and their pattern is overwritten.`
    : `The level plays as usual; the word at ${hex(MEM2_USABLE_END)} reads ${hex(blockAt)} and the ${size / 1024} KB above it keep their pattern.`,
  inspect,
});
for (const reading of record.inspections ?? []) {
  const at = reading.capture ? reading.capture.replace(/^.*[/\\]/, '') : 'the end';
  if (reading.error) log(`  ${at}: ${reading.error}`);
  else
    log(
      `  ${at}: usable end ${hex(reading.result.usable_end)}, block ${reading.result.block_intact ? 'intact' : `CHANGED (${reading.result.changed_words} words, first at ${hex(reading.result.first_changed)})`}`,
    );
}
console.log(
  JSON.stringify(
    {
      run: record.id,
      status: record.status,
      consumption: record.consumption?.verified,
      reserved: { at: blockAt, size },
      inspections: record.inspections,
      screenshots: record.screenshots,
    },
    null,
    2,
  ),
);
