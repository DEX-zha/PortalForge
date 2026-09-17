// The helpers every duplication planner goes through.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyEdits, checkPlanSchema, graphSummary, writePlanFiles } from '../src/igz/plan-common.mjs';

const outside = edit => `edit +0x${edit.offset.toString(16)} outside the record`;

test('applyEdits: writes big-endian values relative to the base and reports the bytes before and after', () => {
  const buffer = Buffer.alloc(32, 0xaa);
  const changes = applyEdits(
    buffer,
    8,
    16,
    [
      { offset: 0, type: 'f32be', value: 1.5 },
      { offset: 4, type: 'u32be', value: 0x01020304 },
      { offset: 8, type: 'u16be', value: 0xbeef },
      { offset: 10, type: 'u8', value: 7 },
    ],
    outside,
  );
  assert.equal(buffer.readFloatBE(8), 1.5);
  assert.equal(buffer.readUInt32BE(12), 0x01020304);
  assert.equal(buffer.readUInt16BE(16), 0xbeef);
  assert.equal(buffer.readUInt8(18), 7);
  assert.deepEqual(changes[0], { field: '+0x0', type: 'f32be', old_hex: 'aaaaaaaa', new_hex: '3fc00000' });
  assert.equal(changes.length, 4);
  // nothing outside the edited fields moved
  assert.equal(buffer.readUInt8(7), 0xaa);
  assert.equal(buffer.readUInt8(19), 0xaa);
});

test('applyEdits: refuses an edit that would run past the record, and an unknown type, without writing', () => {
  const buffer = Buffer.alloc(16, 0);
  assert.throws(
    () => applyEdits(buffer, 0, 8, [{ offset: 6, type: 'u32be', value: 1 }], outside),
    /\+0x6 outside the record/,
  );
  assert.throws(
    () => applyEdits(buffer, 0, 8, [{ offset: 0, type: 'f64', value: 1 }], outside),
    /unsupported edit type f64/,
  );
  assert.ok(buffer.every(byte => byte === 0));
});

test('checkPlanSchema: validates the common core and ignores what a planner adds on top', () => {
  const plan = {
    source: { object_offset: 16, type_name: 'Thing', finding_id: 'x.y', block_bytes: 64 },
    changes: [],
    insert_at: 32,
    updates: [],
    new_id: 1,
    validation: { status: 'VALID', failures: [] },
    mode: 'replace-node',
    pointers: { internal: 1, external: 0 },
  };
  checkPlanSchema(plan);
  assert.equal(plan.schema_valid, true, JSON.stringify(plan.schema_errors));
  assert.equal(plan.schema_errors, null);

  const broken = { ...plan, insert_at: 'not a number' };
  checkPlanSchema(broken);
  assert.equal(broken.schema_valid, false);
  assert.ok(broken.schema_errors.length > 0);
});

test('graphSummary and writePlanFiles', () => {
  assert.equal(graphSummary(null), null);
  assert.deepEqual(graphSummary({ objects: [1, 2, 3], accounting: { total: 9 } }), {
    objects: 3,
    accounting: { total: 9 },
  });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-common-'));
  try {
    const outFile = path.join(dir, 'nested', 'level.bin');
    const planFile = path.join(dir, 'plan.json');
    const result = { buffer: Buffer.from([1, 2, 3]), plan: { new_id: 5 }, graph_after: { objects: 1 } };
    const written = writePlanFiles(result, { outFile, planFile });
    assert.deepEqual(written, { outFile: path.resolve(outFile), planFile: path.resolve(planFile) });
    assert.deepEqual([...fs.readFileSync(outFile)], [1, 2, 3]);
    assert.deepEqual(JSON.parse(fs.readFileSync(planFile, 'utf8')), {
      new_id: 5,
      output: path.resolve(outFile),
      graph_after: { objects: 1 },
    });
    assert.deepEqual(writePlanFiles(result, { outFile, planFile: null }).planFile, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
