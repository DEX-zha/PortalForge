// Live-memory candidate validation (research.md R11 step 3): boot the plain dump, enter the level,
// search emulated RAM for byte patterns taken from the decoded level IGZ, then optionally write a
// changed float at a found address and capture before/after screenshots. Reversible, no archive
// mutation; results feed finding evidence (UNKNOWN -> LIKELY), never a gate.
import fs from 'node:fs';
import path from 'node:path';
import { bridgeCall } from '../../../dolphin-mcp/runtime.mjs';
import { GameSession, gameFromConfig, readScript, defaultScript, evidence } from './run-game.mjs';

const REGIONS = [[0x80000000, 0x81800000], [0x90000000, 0x94000000]];

export async function scanRam(patterns, { log = console.log, regions = REGIONS } = {}) {
  const needles = patterns.map(p => ({ hex: p, buf: Buffer.from(p, 'hex') }));
  const maxLen = Math.max(...needles.map(n => n.buf.length));
  const matches = needles.map(() => []);
  for (const [start, end] of regions) {
    let previous = Buffer.alloc(0);
    for (let address = start; address < end; address += 65536) {
      const bytes = Buffer.from(await bridgeCall('memory.read_bytes', [address, Math.min(65536, end - address)], 30000), 'hex');
      const combined = Buffer.concat([previous, bytes]);
      needles.forEach((n, i) => { let o = combined.indexOf(n.buf); while (o !== -1) { matches[i].push(address - previous.length + o); o = combined.indexOf(n.buf, o + 1); } });
      previous = combined.subarray(Math.max(0, combined.length - maxLen + 1));
      if ((address - start) % 0x1000000 === 0) log(`  scanned up to 0x${address.toString(16)}`);
    }
  }
  return needles.map((n, i) => ({ pattern: n.hex, matches: matches[i].map(a => '0x' + a.toString(16)) }));
}

// Snapshot of a RAM region as one Buffer (64 KB bridge reads).
export async function snapshot(start, end, log = null) {
  const parts = [];
  for (let address = start; address < end; address += 65536) {
    parts.push(Buffer.from(await bridgeCall('memory.read_bytes', [address, Math.min(65536, end - address)], 30000), 'hex'));
    if (log && (address - start) % 0x800000 === 0) log(`  snapshot 0x${address.toString(16)}`);
  }
  return Buffer.concat(parts);
}

// Floats (big-endian, 4-aligned) that changed between two snapshots by a bounded amount; runs of
// three consecutive changed floats are reported as triples (position candidates).
export function diffFloats(a, b, base, { minDelta = 0.2, maxDelta = 500, maxAbs = 1e5 } = {}) {
  const changed = [];
  for (let o = 0; o + 4 <= Math.min(a.length, b.length); o += 4) {
    if (a.readUInt32BE(o) === b.readUInt32BE(o)) continue;
    const x = a.readFloatBE(o), y = b.readFloatBE(o);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > maxAbs || Math.abs(y) > maxAbs) continue;
    const d = Math.abs(y - x); if (d < minDelta || d > maxDelta) continue;
    changed.push({ address: base + o, before: x, after: y, delta: y - x });
  }
  const triples = [];
  for (let i = 0; i + 2 < changed.length; i++) {
    if (changed[i + 1].address === changed[i].address + 4 && changed[i + 2].address === changed[i].address + 8) triples.push({ address: '0x' + changed[i].address.toString(16), before: [changed[i].before, changed[i + 1].before, changed[i + 2].before].map(v => +v.toFixed(3)), after: [changed[i].after, changed[i + 1].after, changed[i + 2].after].map(v => +v.toFixed(3)) });
  }
  return { changed: changed.length, triples };
}

// Boot, restore a native state (tutorial start), snapshot MEM1, move the character, snapshot again,
// move back, snapshot a third time; report float triples that moved and returned.
export async function ramDiff({ label = 'ram-diff', game = gameFromConfig(), stateSlot = 6, region = [0x80000000, 0x81800000], moveFrames = 90, figure = null, log = console.log } = {}) {
  const session = await new GameSession(log).connect();
  const report = { label, started: new Date().toISOString(), state_slot: stateSlot, region: region.map(r => '0x' + r.toString(16)), figure };
  try {
    await session.launch(game, label);
    await session.waitSeconds(25);                          // strap screen: game running, safe to load a state
    // The Portal is empty in a fresh session: the figure must be on it before the state is restored,
    // otherwise the game shows "put a Skylander on the Portal" and inputs move nothing.
    if (figure) report.figure_load = await session.loadFigure(figure, 1);
    report.load_state = await session.loadState(stateSlot);
    await session.waitSeconds(15);
    report.shots = [await session.screenshot(`${label}-restored`)];
    const a = await snapshot(region[0], region[1], log);
    await session.nunchuk({ StickX: 1, StickY: 0 }, moveFrames); await session.waitSeconds(3);
    report.shots.push(await session.screenshot(`${label}-moved-right`));
    const b = await snapshot(region[0], region[1]);
    await session.nunchuk({ StickX: -1, StickY: 0 }, moveFrames); await session.waitSeconds(3);
    report.shots.push(await session.screenshot(`${label}-moved-back`));
    const c = await snapshot(region[0], region[1]);
    const ab = diffFloats(a, b, region[0]), bc = diffFloats(b, c, region[0]);
    // Position candidates: triples that changed on both moves with opposite sign on the dominant axis.
    const back = new Map(bc.triples.map(t => [t.address, t]));
    report.candidates = ab.triples.filter(t => back.has(t.address)).map(t => { const r = back.get(t.address); const dx = t.after.map((v, i) => v - t.before[i]); const dr = r.after.map((v, i) => v - r.before[i]); const k = dx.map(Math.abs).indexOf(Math.max(...dx.map(Math.abs))); return { ...t, delta_right: dx.map(v => +v.toFixed(3)), delta_back: dr.map(v => +v.toFixed(3)), dominant_axis: k, reverses: Math.sign(dx[k]) === -Math.sign(dr[k]) }; }).filter(c => c.reverses);
    report.changed_ab = ab.changed; report.changed_bc = bc.changed; report.triples_ab = ab.triples.length;
    report.status = 'DONE';
    log(`candidates: ${report.candidates.length}`); report.candidates.slice(0, 10).forEach(c => log(`  ${c.address} ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)} right=${JSON.stringify(c.delta_right)} back=${JSON.stringify(c.delta_back)}`));
  } catch (e) { report.status = 'FAIL'; report.error = e.message; }
  finally {
    report.stop = await session.stop(); await session.close();
    report.finished = new Date().toISOString();
    fs.mkdirSync(evidence, { recursive: true });
    report.output = path.join(evidence, `${label}.json`);
    fs.writeFileSync(report.output, JSON.stringify(report, null, 2));
  }
  return report;
}

// patterns: hex strings; pokes: [{address, value, type: 'f32be'}] applied after the scan (address may be
// "match:<patternIndex>:<offset>" to target the first match of a pattern plus a byte offset).
export async function liveProbe({ script = defaultScript, figure = null, label = 'live-probe', game = gameFromConfig(), patterns = [], pokes = [], saveSlot = null, log = console.log }) {
  const session = await new GameSession(log).connect();
  const report = { label, started: new Date().toISOString(), patterns, pokes, scan: null, poke_results: [], shots: [] };
  try {
    await session.launch(game, label);
    report.trace = await session.runScript(readScript(script), { labelPrefix: label, onShot: f => report.shots.push(f), figure });
    if (saveSlot) { try { report.saved_state = await session.saveState(saveSlot); } catch (e) { report.saved_state = { error: e.message }; } }
    if (patterns.length) { log('scanning RAM for ' + patterns.length + ' pattern(s)'); report.scan = await scanRam(patterns, { log }); }
    for (const poke of pokes) {
      let address = poke.address;
      const m = /^match:(\d+):(-?\d+)$/.exec(String(address));
      if (m) { const first = report.scan?.[Number(m[1])]?.matches?.[0]; if (!first) { report.poke_results.push({ ...poke, skipped: 'pattern not found' }); continue; } address = parseInt(first, 16) + Number(m[2]); }
      address = Number(address);
      const before = await session.json('dolphin_read_float', { address, bits: 32 }).catch(e => ({ error: e.message }));
      const shotBefore = await session.screenshot(`${label}-poke-${address.toString(16)}-before`);
      const write = await session.json('dolphin_write_float', { address, bits: 32, value: poke.value }).catch(e => ({ error: e.message }));
      await session.waitSeconds(poke.wait ?? 4);
      const shotAfter = await session.screenshot(`${label}-poke-${address.toString(16)}-after`);
      const after = await session.json('dolphin_read_float', { address, bits: 32 }).catch(e => ({ error: e.message }));
      report.poke_results.push({ address: '0x' + address.toString(16), value: poke.value, before, write, after, shot_before: shotBefore, shot_after: shotAfter });
      log(`  poke 0x${address.toString(16)} = ${poke.value}: before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
    }
    report.status = 'DONE';
  } catch (e) { report.status = 'FAIL'; report.error = e.message; }
  finally {
    report.stop = await session.stop(); await session.close();
    report.finished = new Date().toISOString();
    fs.mkdirSync(evidence, { recursive: true });
    report.output = path.join(evidence, `${label}.json`);
    fs.writeFileSync(report.output, JSON.stringify(report, null, 2));
  }
  return report;
}
