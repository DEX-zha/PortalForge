// What the game said about added objects, kept per family (feature 007).
//
// Every launch that carries additions inspects each of them from memory at the captures of the level and at the
// end (native-run.mjs `inspectAdditions`). This module turns those inspections into one verdict per addition and
// files it under the addition's family, so that the evidence on a card grows from ordinary use: nobody has to run
// a test for it. A report confirms nothing by itself; it says what was seen, in which runs.
import fs from 'node:fs';
import path from 'node:path';
import { local } from '../experiments/run-game.mjs';
import { familyKey, PROBE_VERSION } from './addition-compatibility.mjs';
import { ATTEMPT_CREATED, HEAP } from './native-layout.mjs';

export const reportsDir = path.join(local, 'addition-validation');
const KEPT_LAUNCHES = 20;
const BYTE_ORDER_MARK = new RegExp('^' + String.fromCharCode(0xfeff));

// What one run says about each addition: `passed` when the last inspection found a live, distinct instance that
// matches the request; `observed` when creation was seen but the final state is unverified; `inconclusive` when
// no inspection can decide creation; `failed` when an inspected row reports a failed attempt/guard. Missing
// reads are not proof of disappearance. A script may transform or destroy a successfully created instance.
const factoryReturned = row => row.attempt === ATTEMPT_CREATED && row.pointer >= HEAP.start && row.pointer < HEAP.end;

export function judgeRun(additions, samples = []) {
  const lastSample = samples.at(-1);
  const last = lastSample?.rows ?? [];
  return additions.map(addition => {
    const rows = samples.flatMap(sample => (sample.rows ?? []).filter(row => row.id === addition.id));
    const final = last.find(row => row.id === addition.id) ?? null;
    const seen = rows.some(row => row.runtime === 'passed');
    const created = seen || rows.some(factoryReturned);
    const runtime =
      final?.runtime === 'passed'
        ? 'passed'
        : created
          ? 'observed'
          : final?.runtime === 'failed'
            ? 'failed'
            : 'inconclusive';
    return {
      id: addition.id,
      source: addition.source,
      runtime,
      seen_alive: seen,
      reason:
        final?.reason ??
        lastSample?.error ??
        (rows.length ? 'No final inspection is available.' : 'The additions were never inspected.'),
      verification_error: final?.verification_error ?? lastSample?.error ?? null,
      state: final?.state ?? null,
      actor: final?.actor ?? null,
      position: final?.position ?? null,
    };
  });
}

const RUNTIME_OF = { passed: 'passed', observed: 'inconclusive', inconclusive: 'inconclusive', failed: 'failed' };
const REASONS = {
  passed: 'Created by the game and verified from memory.',
  observed:
    'Creation was observed, but the final state could not be verified. This alone does not establish disappearance or its cause.',
};

function readReport(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(BYTE_ORDER_MARK, ''));
  } catch {
    return null;
  }
}

// Files one run. `results` are judgeRun rows; several additions of one family count as one verdict, the worst.
export function fileLaunchReports(session, results, { run, at = new Date().toISOString(), dir = reportsDir } = {}) {
  if (!results?.length) return [];
  fs.mkdirSync(dir, { recursive: true });
  const byOffset = new Map(session.placements.map(p => [p.offset, p]));
  const families = new Map();
  for (const row of results) {
    const placement = byOffset.get(row.source);
    if (!placement) continue;
    const family = familyKey(session, placement);
    const entry = families.get(family) ?? { placement, rows: [] };
    entry.rows.push(row);
    families.set(family, entry);
  }
  const order = ['failed', 'inconclusive', 'observed', 'passed'];
  const written = [];
  for (const [family, { placement, rows }] of families) {
    const worst = rows.slice().sort((a, b) => order.indexOf(a.runtime) - order.indexOf(b.runtime))[0];
    const file = path.join(dir, family + '.json');
    const previous = readReport(file);
    const launches = [
      ...(previous?.launches ?? []),
      { run: run ?? null, at, source: worst.source, runtime: worst.runtime, additions: rows.length },
    ].slice(-KEPT_LAUNCHES);
    const report = {
      version: PROBE_VERSION,
      family,
      ...(previous?.batch ? { batch: previous.batch } : {}),
      source: worst.source,
      name: placement.name,
      level: session.archive,
      runtime: RUNTIME_OF[worst.runtime],
      observed_live: rows.some(row => row.seen_alive) || launches.some(l => l.runtime === 'passed'),
      visual: previous?.visual ?? 'pending',
      gameplay: previous?.gameplay ?? 'pending',
      runs: launches.length,
      passed_launches: launches.filter(l => l.runtime === 'passed').length,
      launches,
      reason:
        worst.runtime === 'observed'
          ? `${REASONS.observed} ${worst.verification_error ?? worst.reason}`
          : (REASONS[worst.runtime] ?? worst.verification_error ?? worst.reason),
      updated: at,
    };
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
    written.push(report);
  }
  return written;
}
