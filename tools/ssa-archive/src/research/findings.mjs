// Research findings (FR-013, FR-014, SC-005): JSON records validated against
// specs/001-ssa-level-research/contracts/finding-record.schema.json, stored in docs/findings/records/,
// rendered to docs/findings/<category>.md. Confidence transitions follow data-model.md:
//   UNKNOWN -> LIKELY     : at least two independent concordant evidence entries
//   LIKELY  -> CONFIRMED  : an Experiment record with status PASS that references the finding
//   any     -> UNKNOWN    : a contradicting experiment, recorded as evidence
// `editable` may be true only when confidence is CONFIRMED (schema-enforced).
import fs from 'node:fs';
import path from 'node:path';
import { schemaValidator, root } from '../workspace/manifest.mjs';
import { CATEGORIES, CONFIDENCE, assertCategory } from './categories.mjs';

const findingsDir = path.join(root, 'docs', 'findings');
const recordsDir = path.join(findingsDir, 'records');
export const experimentsDir = path.join(root, '.local', 'dolphin-evidence', 'experiments');

const validator = () => schemaValidator('finding-record.schema.json');
const today = () => new Date().toISOString().slice(0, 10);

export function validate(record) {
  const v = validator();
  const ok = v(record);
  const errors = ok ? [] : v.errors.map(e => `${e.instancePath || '/'} ${e.message}`);
  if (record.category !== undefined) {
    try {
      assertCategory(record.category);
    } catch (e) {
      errors.push(e.message);
    }
  }
  if (record.editable && record.confidence !== 'CONFIRMED') errors.push('editable requires confidence CONFIRMED');
  return { valid: errors.length === 0, errors };
}

const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); // tolerate a UTF-8 BOM
export function list({ dir = recordsDir } = {}) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => readJson(path.join(dir, f)));
}
export function load(id, { dir = recordsDir } = {}) {
  const f = path.join(dir, `${id}.json`);
  if (!fs.existsSync(f)) throw new Error(`No finding ${id}`);
  return readJson(f);
}
export function save(record, { dir = recordsDir } = {}) {
  const r = { ...record, updated: record.updated ?? today(), category: record.category ?? 'container' };
  const check = validate(r);
  if (!check.valid) throw new Error(`Finding ${r.id ?? '?'} is invalid: ${check.errors.join('; ')}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${r.id}.json`), JSON.stringify(r, null, 2));
  return r;
}

// Only CONFIRMED findings flagged editable may ever be offered as editable properties.
export const editableFindings = opts => list(opts).filter(f => f.confidence === 'CONFIRMED' && f.editable === true);

function experimentStatus(experimentId, { experiments = experimentsDir } = {}) {
  const f = path.join(experiments, `${experimentId}.json`);
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

// Evidence is always kept, even when it does not yet justify a promotion.
function addEvidence(id, evidence, opts = {}) {
  const r = load(id, opts);
  const ev = { ...evidence };
  if (!ev.summary) throw new Error('evidence.summary is required');
  r.evidence = [...(r.evidence ?? []), ev];
  r.updated = today();
  return save(r, opts);
}

// Record evidence, then move the confidence according to the state machine; throws when the
// evidence on file does not satisfy the rule for the requested level.
export function promote(id, { to, evidence, opts = {} }) {
  if (!CONFIDENCE.includes(to)) throw new Error(`confidence must be one of ${CONFIDENCE.join(', ')}`);
  const ev = evidence ? { ...evidence } : null;
  const r = ev ? addEvidence(id, ev, opts) : load(id, opts);
  const independent = new Set(r.evidence.map(e => e.experiment_id ?? e.probe ?? e.summary));
  if (to === 'LIKELY') {
    if (independent.size < 2)
      throw new Error(`UNKNOWN -> LIKELY needs two independent concordant observations (have ${independent.size})`);
  } else if (to === 'CONFIRMED') {
    if (!ev?.experiment_id) throw new Error('LIKELY -> CONFIRMED needs evidence with an experiment_id');
    const exp = experimentStatus(ev.experiment_id, opts);
    if (!exp) throw new Error(`Experiment record ${ev.experiment_id} not found`);
    if (exp.status !== 'PASS') throw new Error(`Experiment ${ev.experiment_id} is ${exp.status}, not PASS`);
    const refs = JSON.stringify(exp);
    if (!refs.includes(id)) throw new Error(`Experiment ${ev.experiment_id} does not reference finding ${id}`);
  }
  r.confidence = to;
  if (to !== 'CONFIRMED') r.editable = false;
  r.updated = today();
  return save(r, opts);
}

export function contradict(id, { evidence, opts = {} }) {
  const r = load(id, opts);
  r.evidence = [...(r.evidence ?? []), { ...evidence, summary: 'CONTRADICTION: ' + evidence.summary }];
  r.confidence = 'UNKNOWN';
  r.editable = false;
  r.updated = today();
  return save(r, opts);
}

export function validateAll(opts = {}) {
  return list(opts).map(r => ({ id: r.id, ...validate(r) }));
}

// Markdown rendering per category: Offset / Type / Endian / Meaning / Evidence / Confidence.
export function render({ dir = recordsDir, outDir = findingsDir } = {}) {
  const all = list({ dir });
  const written = [];
  for (const [category, title] of Object.entries(CATEGORIES)) {
    const rows = all.filter(r => (r.category ?? 'container') === category);
    if (!rows.length) continue;
    const lines = [
      `# Findings — ${title}`,
      '',
      `Generated by \`ssa-archive findings render\` from \`docs/findings/records/\`. Do not edit by hand. Labels: CONFIRMED (experimentally demonstrated), LIKELY (concordant observations), UNKNOWN (hypothesis). Only CONFIRMED findings may be editable.`,
      '',
      '| Id | Structure | Location | Type | Endian | Meaning | Evidence | Confidence | Editable | Updated |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ];
    for (const r of rows) {
      const loc = `${r.location.file_pattern} @ ${typeof r.location.offset === 'number' ? '0x' + r.location.offset.toString(16) : r.location.offset} (${r.location.length})`;
      const ev = r.evidence
        .map(e => (e.experiment_id ? `[${e.experiment_id}] ` : e.probe ? `(${e.probe}) ` : '') + e.summary)
        .join('<br>');
      lines.push(
        `| ${r.id} | ${r.structure} | ${loc} | ${r.type} | ${r.endian} | ${r.meaning.replace(/\|/g, '\\|')} | ${ev.replace(/\|/g, '\\|')} | **${r.confidence}** | ${r.editable ? 'yes' : 'no'} | ${r.updated} |`,
      );
    }
    const out = path.join(outDir, `${category}.md`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(out, lines.join('\n') + '\n');
    written.push(out);
  }
  // docs/format/iga-v4.md = hand-maintained intro + generated container and IGZ tables (T066: no drift).
  const formatDir = path.join(path.dirname(outDir), 'format');
  const introFile = path.join(formatDir, 'iga-v4.intro.md');
  if (fs.existsSync(introFile)) {
    const parts = [fs.readFileSync(introFile, 'utf8').trimEnd(), ''];
    for (const cat of ['container', 'igz-objects']) {
      const f = path.join(outDir, `${cat}.md`);
      if (fs.existsSync(f)) parts.push(fs.readFileSync(f, 'utf8').replace(/^# /, '## ').trimEnd(), '');
    }
    const target = path.join(formatDir, 'iga-v4.md');
    fs.writeFileSync(target, parts.join('\n'));
    written.push(target);
  }
  return written;
}
