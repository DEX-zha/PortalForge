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
