// Corpus validation for the frozen placement model v1 (spec 002).
//
// Runs the structural resolver over a set of IGZ files and reports, per file and in aggregate: how many
// placements were found, how many resolved a model and how, how many model records are shared, how the safety
// rules grade the level, and whether every produced record validates against placement-v1.schema.json.
//
// The point is not the totals but the rates and the failures: a resolution rate that collapses on a new file,
// an ambiguity that appears for the first time, or a record that stops matching the frozen schema are all
// signals that the model needs a revision rather than a patch.
import fs from 'node:fs';
import path from 'node:path';
import { buildGraph } from './graph.mjs';
import { resolveAll, validateAgainstFixups } from './model-resolve.mjs';
import { schemaValidator, contracts002 } from '../workspace/manifest.mjs';
import { assessPlacement, worst, SEVERITY } from '../editor/safety.mjs';

const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);

export function corpusReport(files, { fixups = {} } = {}) {
  const validate = schemaValidator('placement-v1.schema.json', contracts002);
  const rows = [];
  for (const file of files) {
    const abs = path.resolve(file);
    const buf = fs.readFileSync(abs);
    let graph;
    try { graph = buildGraph(buf, { fields: false }); }
    catch (e) { rows.push({ file: abs, name: path.basename(path.dirname(path.dirname(abs))) || path.basename(abs), error: e.message }); continue; }
    const fx = fixups[abs] ?? fixups[file] ?? null;
    const res = resolveAll(buf, graph, fx);
    const schema = { checked: res.rows.length, invalid: 0, errors: [] };
    for (const r of res.rows) {
      if (validate(r)) continue;
      schema.invalid++;
      if (schema.errors.length < 3) schema.errors.push({ offset: r.offset, errors: (validate.errors ?? []).slice(0, 2).map(e => `${e.instancePath} ${e.message}`) });
    }
    const tally = {}; for (const s of SEVERITY) tally[s] = 0;
    for (const r of res.rows) tally[worst(assessPlacement(r, { hasRuntimeMap: !!fx }))]++;
    const layered = res.rows.filter(r => r.layers.length).length;
    const row = {
      file: abs, name: path.basename(path.dirname(path.dirname(abs))) || path.basename(abs),
      has_runtime_map: !!fx,
      detected: res.file_has_placements ? { placement_type: res.classes.placement_type, model_type: res.classes.model_type,
        strict: res.detection?.chosen?.strict ?? 0, entries: res.detection?.chosen?.entries ?? 0,
        runner_up: res.detection?.runner_up?.strict ?? 0 } : null,
      placements: res.placements,
      counts: { direct: res.counts.direct ?? 0, indirect: res.counts.indirect ?? 0, ambiguous: res.counts.ambiguous ?? 0, absent: res.counts.absent ?? 0 },
      rates: { resolved: pct((res.counts.direct ?? 0) + (res.counts.indirect ?? 0), res.placements),
        ambiguous: pct(res.counts.ambiguous ?? 0, res.placements),
        absent: pct(res.counts.absent ?? 0, res.placements),
        layered: pct(layered, res.placements) },
      models: { records: res.models.length, shared: res.shared_models, inside_a_placement: res.models_inside_a_placement,
        shared_rate: pct(res.shared_models, res.models.length), max_users: res.models[0]?.user_count ?? 0 },
      safety: tally, schema,
    };
    if (fx) {
      const v = validateAgainstFixups(buf, graph, fx);
      row.ground_truth = { total: v.total, agreed: v.agreed, agreement: pct(v.agreed, v.total), false_positives: v.false_positives.length, missed: v.missed.length };
    }
    rows.push(row);
  }
  const ok = rows.filter(r => !r.error);
  const sum = k => ok.reduce((a, r) => a + k(r), 0);
  const totals = {
    files: rows.length, failed: rows.filter(r => r.error).length,
    placements: sum(r => r.placements),
    direct: sum(r => r.counts.direct), indirect: sum(r => r.counts.indirect),
    ambiguous: sum(r => r.counts.ambiguous), absent: sum(r => r.counts.absent),
    model_records: sum(r => r.models.records), shared_models: sum(r => r.models.shared), models_inside: sum(r => r.models.inside_a_placement),
    schema_checked: sum(r => r.schema.checked), schema_invalid: sum(r => r.schema.invalid),
    safety: SEVERITY.reduce((a, s) => (a[s] = sum(r => r.safety[s]), a), {}),
  };
  totals.rates = { resolved: pct(totals.direct + totals.indirect, totals.placements), ambiguous: pct(totals.ambiguous, totals.placements),
    absent: pct(totals.absent, totals.placements), shared_models: pct(totals.shared_models, totals.model_records),
    models_inside: pct(totals.models_inside, totals.model_records), schema_valid: pct(totals.schema_checked - totals.schema_invalid, totals.schema_checked) };
  return { model_version: 1, generated: new Date().toISOString().slice(0, 10), rows, totals };
}

export function formatCorpus(rep) {
  const L = [];
  L.push(`placement model v1 over ${rep.totals.files} file(s): ${rep.totals.placements} placements, ${rep.totals.rates.resolved}% resolved, ${rep.totals.rates.ambiguous}% ambiguous, ${rep.totals.rates.absent}% without a model`);
  L.push(`schema placement-v1: ${rep.totals.schema_checked - rep.totals.schema_invalid}/${rep.totals.schema_checked} records valid (${rep.totals.rates.schema_valid}%)`);
  L.push(`model records: ${rep.totals.model_records}, ${rep.totals.shared_models} shared (${rep.totals.rates.shared_models}%), ${rep.totals.models_inside} inside another placement's blob (${rep.totals.rates.models_inside}%)`);
  L.push(`safety: ` + SEVERITY.map(s => `${s} ${rep.totals.safety[s]}`).join(', '));
  L.push('');
  L.push('file                      class  placements  resolved  ambig  absent  layered  models  shared  schema  safety worst-of');
  for (const r of rep.rows) {
    if (r.error) { L.push(`${r.name.padEnd(24)} ERROR ${r.error}`); continue; }
    const cls = r.detected ? `t${r.detected.placement_type}` : 'none';
    const worstLevel = SEVERITY.find(s => r.safety[s] > 0) ?? 'info';
    L.push(`${r.name.slice(0, 24).padEnd(24)} ${cls.padEnd(6)} ${String(r.placements).padStart(10)} ${(r.rates.resolved + '%').padStart(9)} ${(r.rates.ambiguous + '%').padStart(6)} ${(r.rates.absent + '%').padStart(7)} ${(r.rates.layered + '%').padStart(8)} ${String(r.models.records).padStart(7)} ${(r.models.shared_rate + '%').padStart(7)} ${((r.schema.checked - r.schema.invalid) + '/' + r.schema.checked).padStart(8)}  ${worstLevel} (${r.safety[worstLevel]})`);
    if (r.ground_truth) L.push(`${''.padEnd(24)} ground truth vs the runtime fixup map: ${r.ground_truth.agreed}/${r.ground_truth.total} (${r.ground_truth.agreement}%), ${r.ground_truth.false_positives} structural-only, ${r.ground_truth.missed} missed`);
    for (const e of r.schema.errors) L.push(`${''.padEnd(24)} schema failure at 0x${e.offset.toString(16)}: ${e.errors.join('; ')}`);
  }
  return L.join('\n');
}
