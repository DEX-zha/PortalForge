import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIgz } from './helpers/synthetic-igz.mjs';
import { relocationTruth, probeFlat, probeBitmap, structuralModel } from '../src/igz/relocation.mjs';

// Build a file where two objects of the same type have a pointer at the same field offset,
// and craft a fixups object whose pointer_words point at those fields.
function fixture() {
  const built = buildIgz({ objects: [
    { type: 3, size: 0x30, fields: [{ at: 0x14, obj: 1 }] },
    { type: 3, size: 0x30, fields: [{ at: 0x14, obj: 0 }] },
    { type: 4, size: 0x40, fields: [{ at: 0x20, obj: 0 }] },
  ] });
  const [a, b, c] = built.objectOffsets;
  const fixups = { section_offset: built.sections.s1, pointer_words: [a + 0x14, b + 0x14, c + 0x20], head_pointer_words: [], id_words: [], cross_pointer_words: [] };
  return { ...built, fixups };
}

test('relocationTruth converts pointer words to section-1 word indices', () => {
  const f = fixture();
  const t = relocationTruth(f.buf, f.fixups);
  assert.equal(t.wordIdx.length, 3);
  assert.ok(t.nWords > 0);
  for (const w of f.fixups.pointer_words) assert.ok(t.wordSet.has((w - t.sec.offset) / 4));
});

test('probeFlat and probeBitmap run and score without matching random sections', () => {
  const f = fixture();
  const t = relocationTruth(f.buf, f.fixups);
  const r = probeFlat(t, 'sec0', f.buf.subarray(f.sections.s0, f.sections.s2));
  assert.ok(r.length > 0);
  for (const x of r) { assert.ok(x.precision >= 0 && x.precision <= 1); assert.ok(x.recall >= 0 && x.recall <= 1); }
  assert.deepEqual(probeBitmap(t, 'x', Buffer.alloc(2)), []);   // too small for a bitmap
});

test('structuralModel credits type-consistent fixed fields', () => {
  const f = fixture();
  const sm = structuralModel(f.buf, f.fixups);
  assert.equal(sm.total, 3);
  // the two type-3 objects share the +0x14 pointer -> a fixed field of the type
  assert.ok(sm.fixed >= 2, `fixed ${sm.fixed}`);
  assert.equal(sm.unexplained, 0);
});

test('decodeScript reads a type-92 script: count/capacity/size word, array at +0x34, instruction opcodes and blob coverage', async () => {
  const { decodeScript, scriptTable } = await import('../src/igz/script.mjs');
  const { buildGraph } = await import('../src/igz/graph.mjs');
  // synthetic script: owner (type 92, 0x34 header + 2 pointers = 0x3c) followed by two instruction records
  const built = buildIgz({ types: ['metaobject', 'a', 'b', 'c', 'd'].concat(Array.from({ length: 88 }, (_, i) => 't' + i)).concat(['script']), strings: ['x', 'set value||=', 'clone||at|facing||cloned'],
    objects: [
      { type: 92, size: 0x3c, fields: [{ at: 0x24, u32: 2 }, { at: 0x28, u32: 2 }, { at: 0x2c, u32: 0x80000008 }, { at: 0x30, obj: 0 }, { at: 0x34, obj: 1 }, { at: 0x38, obj: 2 }] },
      { type: 3, size: 0x20, fields: [{ at: 0x08, u32: 0x01000002 }] },   // section-indexed string pointer: 0x01 | offset of "set value||="
      { type: 4, size: 0x20, fields: [{ at: 0x08, u32: 0x0100000f }] },   // 0x01 | offset of "clone||at|facing||cloned"
    ], headTable: [0] });
  const [S, i1, i2] = built.objectOffsets;
  // owner +0x30 must point at own +0x34 (the array), not at the owner header: patch it
  const secOff = built.sections.s1; built.buf.writeUInt32BE(S + 0x34 - secOff, S + 0x30);
  const g = buildGraph(built.buf);
  assert.deepEqual(scriptTable(built.buf, g), [S]);
  const d = decodeScript(built.buf, g, { pointer_words: [S + 0x34, S + 0x38] }, S);
  assert.equal(d.count, 2); assert.deepEqual(d.issues, []);
  assert.equal(d.instructions[0].target, i1); assert.equal(d.instructions[0].opcode, 'set value||=');
  assert.equal(d.instructions[1].target, i2); assert.equal(d.instructions[1].opcode, 'clone||at|facing||cloned');
  assert.ok(d.instructions.every(e => e.in_blob && e.header));
  assert.equal(d.coverage.uncovered_bytes, 0);
});
