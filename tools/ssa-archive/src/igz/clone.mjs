// Entity duplication plan (spec 002 US3, gate M3). Clones one object of a decoded IGZ v5 file:
//   1. the source finding must be CONFIRMED (constitution I; FR-005);
//   2. the object bytes are copied, size-preserving field edits applied, a fresh 0x01xxxxxx id set;
//   3. the copy is appended at the end of the object section (aligned to the section alignment),
//      later sections and the section table shift by the inserted size;
//   4. optionally the section-1 header list (count at +0x0C/+0x10, offsets at the flagged pointer) gets
//      one more entry pointing at the clone (research.md R4: meaning UNKNOWN, hence opt-in);
//   5. the result is re-parsed: object count +1, sections end at EOF, the clone's references resolve.
// Anything the plan cannot prove is recorded in validation.failures; a plan is VALID only when the
// rebuilt graph checks pass. Whether the game honours the clone is decided by the M3 experiment.
import fs from 'node:fs';
import path from 'node:path';
import { buildGraph, validateGraph } from './graph.mjs';
import { makeResolver } from './refs.mjs';
import { schemaValidator, contracts002 } from '../workspace/manifest.mjs';
import * as Findings from '../research/findings.mjs';

const TYPES = {
  f32be: [4, (b, o, v) => b.writeFloatBE(v, o)],
  u32be: [4, (b, o, v) => b.writeUInt32BE(v >>> 0, o)],
  u16be: [2, (b, o, v) => b.writeUInt16BE(v, o)],
  u8: [1, (b, o, v) => b.writeUInt8(v, o)],
};

export function planClone(buf, { objectOffset, findingId, edits = [], appendToList = false, findingsOpts = {} }) {
  const failures = [];
  const finding = Findings.load(findingId, findingsOpts);
  if (finding.confidence !== 'CONFIRMED') {
    const e = new Error(`Finding ${findingId} is ${finding.confidence}; duplication needs CONFIRMED`);
    e.exitCode = 1;
    throw e;
  }
  const graph = buildGraph(buf, { fields: false });
  const source = graph.objects.find(o => o.offset === objectOffset);
  if (!source) {
    const e = new Error(`No object at 0x${objectOffset.toString(16)}`);
    e.exitCode = 1;
    throw e;
  }
  const objSec = graph.sections[graph.object_section];
  const align = Math.max(4, objSec.align || 4);
  const insertAt = objSec.offset + objSec.size; // end of the object section
  const cloneBytes = Buffer.from(buf.subarray(source.offset, source.offset + source.size));
  const changes = [];
  for (const ed of edits) {
    const [width, write] = TYPES[ed.type] ?? [];
    if (!write) throw new Error(`unsupported edit type ${ed.type}`);
    if (ed.offset + width > cloneBytes.length) throw new Error(`edit +0x${ed.offset.toString(16)} outside the object`);
    const old_hex = cloneBytes.subarray(ed.offset, ed.offset + width).toString('hex');
    write(cloneBytes, ed.offset, ed.value);
    changes.push({
      field: '+0x' + ed.offset.toString(16),
      type: ed.type,
      old_hex,
      new_hex: cloneBytes.subarray(ed.offset, ed.offset + width).toString('hex'),
    });
  }
  const maxId = Math.max(...graph.objects.map(o => o.id));
  const newId = maxId + 1;
  cloneBytes.writeUInt32BE(newId >>> 0, 8);
  const padded = Math.ceil(cloneBytes.length / align) * align;
  const inserted = Buffer.alloc(padded);
  cloneBytes.copy(inserted);
  // Assemble: [0, insertAt) + clone + [insertAt, end)
  const out = Buffer.concat([buf.subarray(0, insertAt), inserted, buf.subarray(insertAt)]);
  const updates = [];
  // Section table: grow the object section, shift later sections.
  for (const s of graph.sections) {
    const row = 0x10 + 16 * s.index;
    if (s.index === objSec.index) {
      out.writeUInt32BE(s.size + padded, row + 4);
      updates.push({ location: row + 4, field: `sections[${s.index}].size`, old: s.size, new: s.size + padded });
    } else if (s.offset >= insertAt) {
      out.writeUInt32BE(s.offset + padded, row);
      updates.push({ location: row, field: `sections[${s.index}].offset`, old: s.offset, new: s.offset + padded });
    }
  }
  let listUpdate = null;
  if (appendToList) {
    // Section-1 header: words +0x0C and +0x10 hold the list count, +0x14 a flagged pointer to the offset array.
    const base = objSec.offset;
    const count = out.readUInt32BE(base + 0x0c),
      ptr = out.readUInt32BE(base + 0x14) & 0x7fffffff;
    const arrayEnd = base + ptr + 4 * count;
    const cloneRel = insertAt - base;
    // Inserting 4 bytes in the array would shift every object: instead reuse the first null (0xFFFFFFFF) slot.
    let slot = -1;
    for (let i = 0; i < count; i++)
      if (out.readUInt32BE(base + ptr + 4 * i) === 0xffffffff) {
        slot = i;
        break;
      }
    if (slot < 0)
      failures.push({
        stage: 'count',
        reason: 'no null slot in the section-1 list; growing the list would shift all objects (not implemented)',
        offset: arrayEnd,
      });
    else {
      out.writeUInt32BE(cloneRel, base + ptr + 4 * slot);
      listUpdate = { location: base + ptr + 4 * slot, field: `list[${slot}]`, old: 0xffffffff, new: cloneRel };
      updates.push(listUpdate);
    }
  }
  // Validation: re-parse.
  let after = null;
  try {
    after = buildGraph(out, { fields: false });
    if (after.objects.length !== graph.objects.length + 1)
      failures.push({
        stage: 'count',
        reason: `object count ${after.objects.length}, expected ${graph.objects.length + 1}`,
      });
    if (!validateGraph(after).valid) failures.push({ stage: 'validation', reason: 'object graph schema failed' });
    if (after.issues.length)
      failures.push(...after.issues.map(i => ({ stage: 'validation', reason: i.reason, offset: i.offset })));
    const clone = after.objects.find(o => o.offset === insertAt);
    if (!clone)
      failures.push({
        stage: 'validation',
        reason: 'clone header not recognised at the insert offset',
        offset: insertAt,
      });
    else {
      const resolver = makeResolver(
        out,
        { sections: after.sections },
        after.sections[after.object_section],
        after.objects,
      );
      const fields = resolver.decodeObject(clone, { limit: 512 });
      const dangling = fields.filter(f => f.kind === 'object_ref' && f.target.offset >= insertAt + padded);
      if (dangling.length)
        failures.push({
          stage: 'reference',
          reason: `${dangling.length} object reference(s) of the clone point past the inserted area`,
          offset: dangling[0].offset,
        });
      if (after.objects.filter(o => o.id === newId).length !== 1)
        failures.push({ stage: 'validation', reason: 'new id not unique' });
    }
  } catch (e) {
    failures.push({ stage: 'validation', reason: e.message });
  }
  const plan = {
    source: { object_offset: source.offset, type_name: source.type_name, finding_id: findingId },
    changes,
    insert_at: insertAt,
    updates,
    new_id: newId,
    validation: { status: failures.length ? 'INVALID' : 'VALID', failures },
    inserted_bytes: padded,
    append_to_list: appendToList,
    list_update: listUpdate,
  };
  const v = schemaValidator('duplication-plan.schema.json', contracts002);
  const { inserted_bytes, append_to_list, list_update, ...strict } = plan;
  plan.schema_valid = v(strict);
  plan.schema_errors = v.errors ?? null;
  return {
    plan,
    buffer: out,
    graph_after: after ? { objects: after.objects.length, accounting: after.accounting } : null,
  };
}

export function writePlan(result, { outFile, planFile }) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, result.buffer);
  if (planFile)
    fs.writeFileSync(
      planFile,
      JSON.stringify({ ...result.plan, output: path.resolve(outFile), graph_after: result.graph_after }, null, 2),
    );
  return { outFile: path.resolve(outFile), planFile: planFile ? path.resolve(planFile) : null };
}
