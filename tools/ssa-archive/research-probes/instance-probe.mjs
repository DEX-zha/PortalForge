// Runtime probe of placement instances on a level reached through the archive redirect (feature 006).
//
// Boots the level in direct play through the editor's own path, and once the game is playing reads the
// constructed placement records in MEM1: the class word, the +0x54 state, the stored and current positions.
// The point is to check, in the running game, which stored records are templates or inactive objects (bit 0 of
// +0x54 in the file, scene-roles.mjs) and which are placed: a template must not be constructed at its storage
// coordinates. One Dolphin boot; the game is stopped as soon as the reads are done.
//
//   node research-probes/instance-probe.mjs [--level Level_000_Mining] [--names "A,B,C"] [--anchor MineTrain]
//
// The resident copy of section 1 is located by searching MEM1 for the anchor's stored position triple (floats
// are not rewritten by the loader, pointers are), then checked on a second placement before anything is read.
import fs from 'node:fs';
import path from 'node:path';
import { openLevel } from '../src/editor/level-open.mjs';
import { applyEdit } from '../src/editor/session.mjs';
import { save, patch, launch } from '../src/editor/save.mjs';
import { editorDeps } from '../src/cli/commands/edit.mjs';
import { local } from '../src/experiments/run-game.mjs';
import { bridgeCall } from '../../dolphin-mcp/runtime.mjs';
import { INSTANCE } from '../src/editor/native-layout.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const level = arg('--level', 'Level_000_Mining');
const anchorName = arg('--anchor', 'MineTrain');
const names = arg(
  '--names',
  'MineTrain,Lantern_01,MiningWall_1(3),Rock_Breakable_Half,Rock_Breakable_Quarter,Rock_Breakable_Full,Switch_90_Art_Template,Mine_Train_Template,Rock_Bit_1,OilCan_Icon,Elemental_Gate_Template,Automaton_Head,Spring,01_loot - gem_emerald',
).split(',');
const log = line => console.error(new Date().toISOString().slice(11, 19) + ' ' + line);

const s = await openLevel(level, { log });
const byName = name => s.placements.find(p => p.name === name.trim());
const anchor = byName(anchorName);
if (!anchor) throw new Error(`no placement named ${anchorName}`);
const check = s.placements.find(p => p.name === 'Lantern_01') ?? s.placements.find(p => p !== anchor && p.model?.path);
const sec = s.graph.sections[s.graph.object_section];
const fileWord = (p, at) => s.buffer.readUInt32BE(p.offset + at);
const fileState = p => fileWord(p, 0x54);

// The same harmless edit as the redirect proofs, so the patch and its checkpoint are reused.
const emerald = byName('01_loot - gem_emerald') ?? s.placements.find(p => p.model?.path && !p.behavior);
applyEdit(s, {
  kind: 'transform',
  target: emerald.offset,
  position: [emerald.position[0], emerald.position[1] + 8, emerald.position[2]],
});
const outDir = path.join(local, 'level-check');
fs.mkdirSync(outDir, { recursive: true });
const written = save(s, { out: path.join(outDir, `redirect-${level.toLowerCase()}.decoded`) });
if (!written.written) throw new Error('save refused: ' + written.plan.failures.map(f => f.reason).join('; '));
const deps = editorDeps({});
patch(s, { deps });
if (!s.lastPatch.redirect) throw new Error('the patch carries no redirect descriptor');

const readBytes = async (address, n) => Buffer.from(await bridgeCall('memory.read_bytes', [address, n]), 'hex');
// The stored position triple, taken from the FILE bytes so no rounding enters the pattern.
const triple = p => s.buffer.subarray(p.offset + 0x24, p.offset + 0x30);

async function locateBase() {
  const pattern = triple(anchor);
  const MEM1 = [0x80000000, 0x81800000];
  const CHUNK = 0x10000;
  for (let at = MEM1[0]; at < MEM1[1]; at += CHUNK - 16) {
    const n = Math.min(CHUNK, MEM1[1] - at);
    let buf;
    try {
      buf = await readBytes(at, n);
    } catch (e) {
      log(`read ${at.toString(16)} failed: ${e.message}`);
      continue;
    }
    let i = buf.indexOf(pattern);
    while (i >= 0) {
      const base = at + i - (anchor.offset + 0x24);
      const probe = await readBytes(base + check.offset + 0x24, 12);
      if (probe.equals(triple(check))) return base;
      i = buf.indexOf(pattern, i + 1);
    }
  }
  return null;
}

const result = { level, anchor: anchorName, base: null, instances: [], started: new Date().toISOString() };
const controller = new AbortController();
let probing = false;
async function probe() {
  probing = true;
  try {
    log('locating the resident section in MEM1');
    const base = await locateBase();
    if (base === null) throw new Error('the anchor position was not found in MEM1');
    result.base = '0x' + base.toString(16);
    log(`section base 0x${base.toString(16)} (file section offset 0x${sec.offset.toString(16)})`);
    for (const name of names) {
      const p = byName(name);
      if (!p) {
        result.instances.push({ name, missing: true });
        continue;
      }
      const at = base + p.offset;
      const head = await readBytes(at, 0x100);
      const pos = [0, 4, 8].map(k => head.readFloatBE(INSTANCE.position + k));
      const cur = [0, 4, 8].map(k => head.readFloatBE(INSTANCE.current_position + k));
      const row = {
        name,
        offset: p.offset,
        address: '0x' + at.toString(16),
        file_state: fileState(p),
        ram_class: '0x' + head.readUInt32BE(0).toString(16),
        ram_state: head.readUInt32BE(INSTANCE.state),
        stored_position: pos.map(v => Math.round(v * 1000) / 1000),
        current_position: cur.map(v => Math.round(v * 1000) / 1000),
        file_position: p.position,
        script: '0x' + head.readUInt32BE(INSTANCE.script).toString(16),
        model: '0x' + head.readUInt32BE(INSTANCE.model).toString(16),
        actor: '0x' + head.readUInt32BE(INSTANCE.actor).toString(16),
        layers: p.layers,
      };
      result.instances.push(row);
      log(
        `${name.padEnd(28)} file +0x54=${row.file_state} ram class ${row.ram_class} state ${row.ram_state} stored ${row.stored_position.join(',')} current ${row.current_position.join(',')} actor ${row.actor}`,
      );
    }
  } catch (e) {
    result.error = e.message;
    log('probe failed: ' + e.message);
  } finally {
    result.finished = new Date().toISOString();
    fs.writeFileSync(path.join(outDir, `instance-probe-${Date.now()}.json`), JSON.stringify(result, null, 2));
    controller.abort();
  }
}

log('launch direct-play through the redirect; the probe runs once the game is playing');
await launch(s, {
  mode: 'direct-play',
  prediction:
    'Placement instances of ' + level + ' read in MEM1: templates and inactive objects not constructed as placed',
  deps: {
    ...deps,
    run: args =>
      deps.run({
        ...args,
        signal: controller.signal,
        onProgress: progress => {
          args.onProgress?.(progress);
          if (progress.phase === 'playing' && !probing) probe();
        },
      }),
  },
  wait: true,
});
const { promise, controller: c, ...launched } = s.lastLaunch;
console.log(
  JSON.stringify(
    { ...result, launch: { id: launched.experiment_id, status: launched.status, error: launched.error } },
    null,
    2,
  ),
);
