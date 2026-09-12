import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildIgz } from './helpers/synthetic-igz.mjs';
import { buildGraph } from '../src/igz/graph.mjs';
import { planClone } from '../src/igz/clone.mjs';
import { save } from '../src/research/findings.mjs';

const finding = (id, confidence) => ({ id, category: 'world-entities', structure: 'test spawn', location: { file_pattern: 'x', offset: 0, length: 12 }, type: 'f32be x3', endian: 'be', meaning: 'test', evidence: confidence === 'UNKNOWN' ? [] : [{ probe: 'p', summary: 's' }], confidence, editable: confidence === 'CONFIRMED', updated: '2026-09-13' });

test('cloning appends the object, shifts later sections, assigns a unique id and re-validates', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-clone-'));
  save(finding('test.spawn', 'CONFIRMED'), { dir }); save(finding('test.guess', 'LIKELY'), { dir });
  const { buf, objectOffsets } = buildIgz({ objects: [
    { type: 4, size: 0x40, fields: [{ at: 0x20, f32: 91.73 }, { at: 0x24, f32: 10.31 }, { at: 0x28, f32: 44.74 }, { at: 0x30, str: 2 }] },
    { type: 3, size: 0x30, fields: [{ at: 0x14, obj: 0 }] },
  ] });
  const before = buildGraph(buf);
  const r = planClone(buf, { objectOffset: objectOffsets[0], findingId: 'test.spawn', edits: [{ offset: 0x20, type: 'f32be', value: 99.73 }], findingsOpts: { dir } });
  assert.equal(r.plan.validation.status, 'VALID', JSON.stringify(r.plan.validation.failures));
  assert.equal(r.plan.schema_valid, true, JSON.stringify(r.plan.schema_errors));
  assert.equal(r.plan.changes[0].field, '+0x20');
  const after = buildGraph(r.buffer, { fields: true });
  assert.equal(after.objects.length, before.objects.length + 1);
  assert.equal(after.sections[2].offset, before.sections[2].offset + r.plan.inserted_bytes);
  assert.equal(after.sections[2].offset + after.sections[2].size, r.buffer.length);
  const clone = after.objects.find(o => o.offset === r.plan.insert_at);
  assert.equal(clone.type_name, 'tfbPhysicsModel');
  assert.equal(clone.id, before.objects.reduce((m, o) => Math.max(m, o.id), 0) + 1);
  assert.equal(r.buffer.readFloatBE(clone.offset + 0x20).toFixed(2), '99.73');
  assert.equal(clone.fields.find(f => f.offset === clone.offset + 0x30).target, 'RockA_01_MAT');   // string refs still resolve after the shift
  assert.throws(() => planClone(buf, { objectOffset: objectOffsets[0], findingId: 'test.guess', findingsOpts: { dir } }), /needs CONFIRMED/);
});
