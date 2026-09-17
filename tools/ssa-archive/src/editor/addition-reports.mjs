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

export const reportsDir = path.join(local, 'addition-validation');
const KEPT_LAUNCHES = 20;
const BYTE_ORDER_MARK = new RegExp('^' + String.fromCharCode(0xfeff));

// What one run says about each addition: `passed` when the last inspection found a live, distinct instance that
// matches the request; `observed` when an earlier inspection did but the last did not (a script may have
// transformed or destroyed it, a pickup may have been collected); `failed` otherwise, with the last reason.
export function judgeRun(additions, samples = []) {
  const last = samples.at(-1)?.rows ?? [];
  return additions.map(addition => {
    const final = last.find(row => row.id === addition.id) ?? null;
    const seen = samples.some(sample => sample.rows.some(row => row.id === addition.id && row.runtime === 'passed'));
    const runtime = final?.runtime === 'passed' ? 'passed' : seen ? 'observed' : 'failed';
    return {
      id: addition.id,
      source: addition.source,
      runtime,
      reason: final?.reason ?? 'The additions were never inspected.',
      verification_error: final?.verification_error ?? null,
      state: final?.state ?? null,
      actor: final?.actor ?? null,
      position: final?.position ?? null,
    };
  });
}

const RUNTIME_OF = { passed: 'passed', observed: 'inconclusive', failed: 'failed' };
const REASONS = {
  passed: 'Created by the game and verified from memory.',
  observed: 'Seen alive during the run but not at its end: a script may have transformed, collected or destroyed it.',
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
  const order = ['failed', 'observed', 'passed'];
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
      source: worst.source,
      name: placement.name,
      level: session.archive,
      runtime: RUNTIME_OF[worst.runtime],
      observed_live: launches.some(l => l.runtime !== 'failed'),
      visual: previous?.visual ?? 'pending',
      gameplay: previous?.gameplay ?? 'pending',
      runs: launches.length,
      passed_launches: launches.filter(l => l.runtime === 'passed').length,
      launches,
      reason: REASONS[worst.runtime] ?? worst.verification_error ?? worst.reason,
      updated: at,
    };
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
    written.push(report);
  }
  return written;
}
