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

// Runtime pointer scan (spec 002 T033). From a native state (tutorial start, figure on the Portal):
//   1. snapshot MEM1 (+ MEM2 unless disabled);
//   2. for each target (file offset in the decoded level.bld, or a raw 0x8xxxxxxx address) read back the
//      resident bytes and diff them against the file bytes -> which header words the loader rewrote;
//   3. search the snapshot for big-endian pointers equal to each target address; every hit is mapped to
//      the file object/field when it lies inside the resident section, otherwise 64 bytes of context are
//      kept (heap object owning the reference);
//   4. optional hex patterns (e.g. the spawn position triple) are searched too, to find live copies.
// One boot, no archive mutation. The report feeds findings (UNKNOWN -> LIKELY), never a gate.
export async function ptrScan({ label = 'ptr-scan', game = gameFromConfig(), stateSlot = 6, figure = null, base = 0x80DBC020, targets = [], patterns = [], fileBuf = null, graph = null, mem2 = true, contextBytes = 64, dumpSection = false, log = console.log } = {}) {
  const { matchAddress } = await import('../igz/match.mjs');
  const session = await new GameSession(log).connect();
  const regions = mem2 ? REGIONS : [REGIONS[0]];
  const report = { label, started: new Date().toISOString(), state_slot: stateSlot, base: '0x' + base.toString(16), figure, targets: [], patterns: [], shots: [] };
  try {
    await session.launch(game, label);
    await session.waitSeconds(25);
    if (figure) report.figure_load = await session.loadFigure(figure, 1);
    report.load_state = await session.loadState(stateSlot);
    await session.waitSeconds(15);
    report.shots.push(await session.screenshot(`${label}-restored`));
    const snaps = [];
    for (const [s, e] of regions) { log(`snapshot 0x${s.toString(16)}..0x${e.toString(16)}`); snaps.push({ start: s, buf: await snapshot(s, e, log) }); }
    const readAt = (addr, n) => { for (const s of snaps) if (addr >= s.start && addr + n <= s.start + s.buf.length) return s.buf.subarray(addr - s.start, addr - s.start + n); return null; };
    const objSec = graph ? graph.sections[graph.object_section] : null;
    const inSection = a => objSec && a >= base + objSec.offset && a < base + objSec.offset + objSec.size;
    if (dumpSection && objSec) {
      // Resident copy of the whole object section: the offline diff against the file gives the complete
      // fixup map (pointers, class pointers, ids, strings) without guessing conventions.
      const live = readAt(base + objSec.offset, objSec.size);
      fs.mkdirSync(evidence, { recursive: true });
      report.section_dump = live ? path.join(evidence, `${label}-section${graph.object_section}.bin`) : null;
      if (live) fs.writeFileSync(report.section_dump, live);
      log(`section ${graph.object_section} resident dump: ${report.section_dump ?? 'outside the snapshot'}`);
    }
    for (const t of targets) {
      const isAddr = t >= 0x80000000; const address = isAddr ? t : base + t; const fileOffset = isAddr ? t - base : t;
      const entry = { target: '0x' + t.toString(16), address: '0x' + address.toString(16), file_offset: fileOffset, object: graph ? matchAddress(graph, address, { base }).object : null, resident_diff: null, referrers: [] };
      if (fileBuf && graph) {
        const obj = graph.objects.find(o => o.offset === fileOffset) ?? matchAddress(graph, address, { base }).object;
        const size = obj ? Math.min(obj.size, 0x400) : 0x40;
        const live = readAt(address, size);
        if (live) {
          const diffs = [];
          for (let q = 0; q + 4 <= size; q += 4) { const a = fileBuf.readUInt32BE(fileOffset + q), b = live.readUInt32BE(q); if (a !== b) diffs.push({ field: '+0x' + q.toString(16), file: '0x' + a.toString(16), live: '0x' + b.toString(16), live_minus_base: b >= base && b < base + fileBuf.length ? '0x' + (b - base).toString(16) : null }); }
          entry.resident_diff = { compared_bytes: size, changed_words: diffs.length, words: diffs.slice(0, 64), identical_floats_at_0x94: obj && obj.size > 0xa0 ? fileBuf.readFloatBE(fileOffset + 0x94) === live.readFloatBE(0x94) : null };
        } else entry.resident_diff = { error: 'address outside the snapshot' };
      }
      const needle = Buffer.alloc(4); needle.writeUInt32BE(address >>> 0);
      for (const s of snaps) {
        let o = s.buf.indexOf(needle);
        while (o !== -1 && entry.referrers.length < 200) {
          const at = s.start + o; const ref = { at: '0x' + at.toString(16), aligned: o % 4 === 0, in_section: inSection(at) };
          if (ref.in_section && graph) { const m = matchAddress(graph, at, { base }); ref.file_offset = m.file_offset; ref.object = m.object; ref.field = m.field; }
          else { const c0 = Math.max(s.start, at - contextBytes / 2); ref.context_at = '0x' + c0.toString(16); ref.context = s.buf.subarray(c0 - s.start, c0 - s.start + contextBytes).toString('hex'); }
          entry.referrers.push(ref); o = s.buf.indexOf(needle, o + 1);
        }
      }
      log(`target ${entry.target}${entry.object ? ' ' + entry.object.type_name + '@0x' + entry.object.offset.toString(16) : ''}: ${entry.referrers.length} runtime referrer(s), ${entry.resident_diff?.changed_words ?? '?'} changed word(s)`);
      report.targets.push(entry);
    }
    for (const hex of patterns) {
      const needle = Buffer.from(hex, 'hex'); const hits = [];
      for (const s of snaps) { let o = s.buf.indexOf(needle); while (o !== -1 && hits.length < 100) { const at = s.start + o; const h = { at: '0x' + at.toString(16), in_section: inSection(at) }; if (h.in_section && graph) { const m = matchAddress(graph, at, { base }); h.object = m.object; h.field = m.field; } else h.context = s.buf.subarray(Math.max(0, o - contextBytes / 2), o + contextBytes / 2).toString('hex'); hits.push(h); o = s.buf.indexOf(needle, o + 1); } }
      log(`pattern ${hex.slice(0, 24)}…: ${hits.length} hit(s)`);
      report.patterns.push({ pattern: hex, hits });
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
