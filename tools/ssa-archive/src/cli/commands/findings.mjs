// `findings <subcommand>` and `gates`: the research ledger. A finding is only ever reported as editable when
// it is both flagged editable and CONFIRMED, which is the rule the editor relies on.
import fs from 'node:fs';
import path from 'node:path';
import { EXIT, need } from '../errors.mjs';
import { pickSubcommand } from '../dispatch.mjs';
import { docsDir } from '../paths.mjs';

const isEditable = record => record.editable === true && record.confidence === 'CONFIRMED';

function list(F, pos, o) {
  const rows = F.list().filter(r => !o.category || r.category === o.category);
  return {
    result: rows.map(r => ({
      id: r.id,
      category: r.category,
      confidence: r.confidence,
      editable: isEditable(r),
      structure: r.structure,
      updated: r.updated,
    })),
    text:
      rows
        .map(r => `${r.confidence.padEnd(9)} ${isEditable(r) ? 'editable ' : '         '} ${r.id}  ${r.structure}`)
        .join('\n') || '(no findings)',
  };
}

function show(F, pos) {
  const record = F.load(need(pos[1], 'id'));
  record.editable = isEditable(record);
  return { result: record, text: JSON.stringify(record, null, 2) };
}

function validate(F) {
  const rows = F.validateAll();
  const invalid = rows.filter(r => !r.valid);
  return {
    result: rows,
    exitCode: invalid.length ? EXIT.FAILED : EXIT.OK,
    text: invalid.length
      ? invalid.map(b => `${b.id}: ${b.errors.join('; ')}`).join('\n')
      : `${rows.length} finding(s) valid`,
  };
}

function render(F) {
  const files = F.render();
  return { result: { files }, text: files.join('\n') };
}

function promote(F, pos, o) {
  const r = F.promote(need(pos[1], 'id'), {
    to: need(o.to, 'to'),
    evidence: { experiment_id: o.experiment, probe: o.probe, summary: need(o.summary, 'summary') },
  });
  return { result: r, text: `${r.id} -> ${r.confidence}` };
}

function editable(F) {
  const rows = F.editableFindings();
  return { result: rows, text: rows.map(r => r.id).join('\n') || '(no editable finding: nothing is CONFIRMED yet)' };
}

const FINDINGS_SUBCOMMANDS = { list, show, validate, render, promote, editable };

export async function findings(pos, o) {
  const F = await import('../../research/findings.mjs');
  const handler = pickSubcommand(
    FINDINGS_SUBCOMMANDS,
    pos[0] ?? 'list',
    name => `Unknown findings subcommand ${name} (list|show|validate|render|promote|editable)`,
  );
  return handler(F, pos, o);
}

const GATE_NAMES = ['M0', 'M1', 'M2', 'M3', 'M4A', 'M4B', 'M5'];

// A gate with no status file has simply not been attempted: it reads UNKNOWN, never FAIL.
function readGate(name) {
  const file = path.join(docsDir, `${name.toLowerCase()}-status.json`);
  if (!fs.existsSync(file)) return { name, status: 'UNKNOWN', evidence: [], validated_on: null };
  const status = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    name,
    status: status.status ?? 'UNKNOWN',
    evidence: status.evidence ?? [],
    validated_on: status.validated_on ?? null,
    details: status.details ?? null,
  };
}

export async function gates() {
  const rows = GATE_NAMES.map(readGate);
  const line = g => `${g.name.padEnd(4)} ${g.status.padEnd(8)} ${g.validated_on ?? ''} ${g.evidence.join(', ')}`;
  return { result: rows, text: rows.map(line).join('\n') };
}
