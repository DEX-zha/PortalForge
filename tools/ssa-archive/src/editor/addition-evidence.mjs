// Resolve a family card to its recorded runs. Ordinary editor launches and the older tutorial test batches
// have different storage layouts; both remain reviewable. Missing local evidence is explicit, never a pass.
import fs from 'node:fs';
import path from 'node:path';
import { reportsDir } from './addition-reports.mjs';

const read = file => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
};
const BATCH = /^batch-[0-9]+-[a-f0-9]{8}$/;
const RUN = /^editor-(?:test|play|direct-test|direct-play)-[0-9]+-[a-f0-9]{8}$/;

export function loadAdditionEvidence(
  key,
  { reports = reportsDir, evidence = path.resolve(reportsDir, '../dolphin-evidence') } = {},
) {
  if (!/^[a-f0-9]{64}$/.test(key)) return null;
  const report = read(path.join(reports, key + '.json'));
  if (!report || (report.family && report.family !== key)) return null;
  const runs = [],
    missing = [];
  if (typeof report.batch === 'string' && BATCH.test(report.batch)) {
    const batch = read(path.join(reports, report.batch, 'result.json'));
    if (Array.isArray(batch?.runs)) runs.push(...batch.runs);
    else missing.push(report.batch);
  }
  const ids = new Set();
  for (const launch of Array.isArray(report.launches) ? report.launches : []) {
    if (typeof launch.run !== 'string' || !RUN.test(launch.run)) {
      missing.push('unavailable launch record');
      continue;
    }
    if (ids.has(launch.run)) continue;
    ids.add(launch.run);
    const run = read(path.join(evidence, 'editor-runs', launch.run + '.json'));
    if (run?.id === launch.run) runs.push(run);
    else missing.push(launch.run);
  }
  return { report, record: { runs, missing } };
}
