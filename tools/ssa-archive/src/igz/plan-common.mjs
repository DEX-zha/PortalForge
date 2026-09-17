// What every duplication planner shares: the confidence gate, size-preserving field edits, the check against
// the frozen plan contract, and writing the result.
//
// A planner never writes to the level it was given. It returns { plan, buffer, graph_after }, and the plan
// carries its own validation, so a refused plan can still be read to find out why it was refused.
import fs from 'node:fs';
import path from 'node:path';
import { schemaValidator, contracts002 } from '../workspace/manifest.mjs';
import * as Findings from '../research/findings.mjs';

// Field types an edit may write: [width in bytes, writer]. Big-endian, as the game stores them.
export const VALUE_TYPES = {
  f32be: [4, (buffer, offset, value) => buffer.writeFloatBE(value, offset)],
  u32be: [4, (buffer, offset, value) => buffer.writeUInt32BE(value >>> 0, offset)],
  u16be: [2, (buffer, offset, value) => buffer.writeUInt16BE(value, offset)],
  u8: [1, (buffer, offset, value) => buffer.writeUInt8(value, offset)],
};

// A duplication recipe may only be planned from a CONFIRMED finding: a LIKELY one has not survived two boots.
export function requireConfirmedFinding(findingId, findingsOpts = {}) {
  const finding = Findings.load(findingId, findingsOpts);
  if (finding.confidence !== 'CONFIRMED') {
    throw Object.assign(new Error(`Finding ${findingId} is ${finding.confidence}; duplication needs CONFIRMED`), {
      exitCode: 1,
    });
  }
  return finding;
}

// Applies `edits` ({ offset, type, value }, offsets relative to `base`) to `buffer`, and returns one change
// record per edit with the bytes before and after. `limit` is the size of the record being edited and
// `outside` names it in the error, because an edit past the end of a record would corrupt its neighbour.
export function applyEdits(buffer, base, limit, edits, outside) {
  const changes = [];
  for (const edit of edits) {
    const [width, write] = VALUE_TYPES[edit.type] ?? [];
    if (!write) throw new Error(`unsupported edit type ${edit.type}`);
    if (edit.offset + width > limit) throw new Error(outside(edit));
    const at = base + edit.offset;
    const old_hex = buffer.subarray(at, at + width).toString('hex');
    write(buffer, at, edit.value);
    changes.push({
      field: '+0x' + edit.offset.toString(16),
      type: edit.type,
      old_hex,
      new_hex: buffer.subarray(at, at + width).toString('hex'),
    });
  }
  return changes;
}

const PLAN_KEYS = ['source', 'changes', 'insert_at', 'updates', 'new_id', 'validation'];
const SOURCE_KEYS = ['object_offset', 'type_name', 'finding_id'];
const pick = (object, keys) => Object.fromEntries(keys.filter(k => k in object).map(k => [k, object[k]]));

// Every planner extends the plan with fields of its own. The frozen contract only describes the common core,
// so that core is what gets validated, and the verdict is recorded on the plan itself.
export function checkPlanSchema(plan) {
  const validate = schemaValidator('duplication-plan.schema.json', contracts002);
  plan.schema_valid = validate({ ...pick(plan, PLAN_KEYS), source: pick(plan.source, SOURCE_KEYS) });
  plan.schema_errors = validate.errors ?? null;
}

export const graphSummary = graph => (graph ? { objects: graph.objects.length, accounting: graph.accounting } : null);

// Writes the modified level and, when asked, the plan that produced it. Returns the resolved paths.
export function writePlanFiles(result, { outFile, planFile }) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, result.buffer);
  if (planFile) {
    fs.writeFileSync(
      planFile,
      JSON.stringify({ ...result.plan, output: path.resolve(outFile), graph_after: result.graph_after }, null, 2),
    );
  }
  return { outFile: path.resolve(outFile), planFile: planFile ? path.resolve(planFile) : null };
}
