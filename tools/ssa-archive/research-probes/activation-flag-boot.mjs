// The activation flag as a switch (feature 007, phase B, experiments B1 and B2).
//
// Every placement record stores 4 (placed) or 5 (stored template or disabled) at +0x54
// (finding igz.placement.inactive-flag). The hypothesis: that word alone decides whether the game instantiates
// the record. This probe flips it on named placements of a level, optionally moves a revealed template with the
// editor's confirmed transform, and boots the result once through the redirect. It reads each target's runtime
// state and actor from memory at every capture of the level and at the end, from the base the level's scene
// snapshot measured.
//
//   node research-probes/activation-flag-boot.mjs --level Level_000_Mining
//        [--off "Lantern_01,Lantern_01(1)"]        placed (4) -> stored (5): predicted gone, state 5, no actor
//        [--on "Rock_Breakable_Half"]              stored (5) -> placed (4): predicted standing, state 1 or 2
//        [--at 80,10.9,-47]                        where the first --on target is put (others follow along x)
//        [--dry]                                   write and check the file only: no patch, no boot
//
// The flag word is not an editor property: it is written here, on a copy, and the copy is checked word by word
// against the opened level before anything is built. One Dolphin boot per invocation.
import fs from 'node:fs';
import path from 'node:path';
import { openLevel } from '../src/editor/level-open.mjs';
import { applyEdit } from '../src/editor/session.mjs';
import { save, redirectFor } from '../src/editor/save.mjs';
import { editorDeps } from '../src/cli/commands/edit.mjs';
import { nativeParamsFor } from '../src/editor/native-params.mjs';
import { readNativeBytes } from '../src/editor/native-run.mjs';
import { INSTANCE, INSTANCE_BYTES, PLACEMENT_CLASS, readVector } from '../src/editor/native-layout.mjs';
import { local } from '../src/experiments/run-game.mjs';

const FLAG = 0x54;
const PLACED = 4;
const STORED = 5;
const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const names = value => (value ? value.split(',').map(n => n.trim()) : []);
const log = line => console.error(new Date().toISOString().slice(11, 19) + ' ' + line);

const level = arg('--level', 'Level_000_Mining');
const s = await openLevel(level, { log });
const params = nativeParamsFor(s);
if (!params.available) throw new Error(params.reason);
const find = name => {
  const p = s.placements.find(x => x.name === name);
  if (!p) throw new Error(`no placement named ${name}`);
  return p;
};
const off = names(arg('--off')).map(find);
const on = names(arg('--on')).map(find);
if (!off.length && !on.length) throw new Error('give --off and/or --on');
for (const p of off)
  if (s.buffer.readUInt32BE(p.offset + FLAG) !== PLACED) throw new Error(`${p.name} is not a placed record`);
for (const p of on)
  if (s.buffer.readUInt32BE(p.offset + FLAG) !== STORED) throw new Error(`${p.name} is not a stored record`);

// A revealed template is moved with the editor's confirmed transform, so that part of the file is written and
// checked by the save plan like any other edit.
const at = arg('--at') ? arg('--at').split(',').map(Number) : null;
if (at && (at.length !== 3 || at.some(n => !Number.isFinite(n)))) throw new Error('--at takes x,y,z');
if (at)
  on.forEach((p, i) => applyEdit(s, { kind: 'transform', target: p.offset, position: [at[0] + i * 3, at[1], at[2]] }));

const dir = path.join(local, 'level-check');
fs.mkdirSync(dir, { recursive: true });
const slug = level.toLowerCase();
let edited = Buffer.from(s.buffer);
if (at && on.length) {
  const written = save(s, { out: path.join(dir, `activation-${slug}.moved.decoded`) });
  if (!written.written) throw new Error('save refused: ' + written.plan.failures.map(f => f.reason).join('; '));
  edited = fs.readFileSync(written.written);
}
const before = Buffer.from(edited);
for (const p of off) edited.writeUInt32BE(STORED, p.offset + FLAG);
for (const p of on) edited.writeUInt32BE(PLACED, p.offset + FLAG);
const expected = new Set([...off, ...on].map(p => p.offset + FLAG));
for (let w = 0; w + 4 <= edited.length; w += 4)
  if (edited.readUInt32BE(w) !== before.readUInt32BE(w) && !expected.has(w))
    throw new Error(`unexpected change at 0x${w.toString(16)}`);
const file = path.join(dir, `activation-${slug}.decoded`);
fs.writeFileSync(file, edited);
for (const p of off) log(`off: ${p.name} at 0x${p.offset.toString(16)} (${p.position.map(n => n.toFixed(1))}) 4 -> 5`);
for (const p of on)
  log(
    `on:  ${p.name} at 0x${p.offset.toString(16)} 5 -> 4${at ? ', moved to ' + p.position.map(n => n.toFixed(1)) : ''}`,
  );
log(`written ${file}: ${expected.size} flag word(s) changed`);
if (process.argv.includes('--dry')) process.exit(0);

const deps = editorDeps({});
const built = deps.build({
  experimentId: `activation-${slug}-${Date.now()}`,
  replacements: [{ disc_path: s.archive, file }],
  entry: s.entry,
  session: s,
  redirect: redirectFor(s),
});
if (!built.redirect) throw new Error('this level cannot be reached automatically: its voice pack is not extracted');

// The targets as the running game holds them: the record sits at base + file offset.
const targets = [...off.map(p => ({ p, asked: 'off' })), ...on.map(p => ({ p, asked: 'on' }))];
const inspect = async () => {
  const rows = [];
  for (const { p, asked } of targets) {
    const b = await readNativeBytes(params.base + p.offset, INSTANCE_BYTES);
    rows.push({
      name: p.name,
      asked,
      constructed: b.readUInt32BE(INSTANCE.class) === PLACEMENT_CLASS,
      state: b.readUInt32BE(INSTANCE.state),
      actor: b.readUInt32BE(INSTANCE.actor),
      position: readVector(b, INSTANCE.position),
    });
  }
  return rows;
};

const prediction = [
  off.length ? `${off.map(p => p.name).join(', ')} no longer ${off.length > 1 ? 'exist' : 'exists'} in the level` : '',
  on.length ? `${on.map(p => p.name).join(', ')} ${on.length > 1 ? 'stand' : 'stands'} in the level as placed` : '',
]
  .filter(Boolean)
  .join('; ');
log(`launch direct-test: ${prediction}`);
const record = await deps.run({
  session: s,
  patch: built.redirect,
  archive: built.redirect.entry_archive,
  mode: 'direct-test',
  redirect: { level: s.archive, name: s.level?.name ?? null },
  prediction,
  inspect,
});
const last = record.inspections?.at(-1);
for (const row of last?.result ?? [])
  log(
    `  ${row.asked.padEnd(3)} ${row.name.padEnd(30)} state ${row.state} actor 0x${row.actor.toString(16)} at ${row.position.map(n => n.toFixed(1))}`,
  );
console.log(
  JSON.stringify(
    {
      run: record.id,
      status: record.status,
      consumption: record.consumption?.verified,
      inspections: record.inspections,
      screenshots: record.screenshots,
    },
    null,
    2,
  ),
);
