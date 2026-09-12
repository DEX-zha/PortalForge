import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildIgz } from './helpers/synthetic-igz.mjs';
import { buildGraph } from '../src/igz/graph.mjs';
import { insertBytes, planReachableClone } from '../src/igz/relocate.mjs';
import { save } from '../src/research/findings.mjs';

const finding = (id, confidence) => ({ id, category: 'world-entities', structure: 'test spawn', location: { file_pattern: 'x', offset: 0, length: 12 }, type: 'f32be x3', endian: 'be', meaning: 'test', evidence: confidence === 'UNKNOWN' ? [] : [{ probe: 'p', summary: 's' }], confidence, editable: confidence === 'CONFIRMED', updated: '2026-09-13' });

// owner (type 3) -> physics (type 4, stored right after it) and -> a shared object (type 1);
// the physics record points back at its owner. Only the owner is registered in the header table.
function fixture() {
  const built = buildIgz({
    objects: [
      { type: 3, size: 0x30, fields: [{ at: 0x14, obj: 1 }, { at: 0x18, obj: 2 }] },
      { type: 4, size: 0x40, fields: [{ at: 0x20, f32: 91.73 }, { at: 0x24, f32: 10.31 }, { at: 0x28, f32: 44.74 }, { at: 0x30, str: 2 }, { at: 0x2c, obj: 0 }] },
      { type: 1, size: 0x20, fields: [{ at: 0x10, str: 1 }] },
    ], headTable: [0],
  });
  const [owner, physics, shared] = built.objectOffsets;
  const fixups = { section_offset: built.sections.s1, pointer_words: [owner + 0x14, owner + 0x18, physics + 0x2c], head_pointer_words: built.headPointerWords, id_words: [owner + 8, physics + 8, shared + 8] };
  return { ...built, owner, physics, shared, fixups };
}

test('insertBytes at the table end shifts every object by the inserted length and rebases all pointers', () => {
  const f = fixture();
  const g = buildGraph(f.buf);
  const sec = g.sections[1];
  const tableEnd = sec.offset + (f.buf.readUInt32BE(sec.offset + 0x14) & 0x7fffffff);
  const entry = Buffer.alloc(4); entry.writeUInt32BE(0x1234);
  const r = insertBytes(f.buf, g, { pointerWords: [...f.fixups.pointer_words, ...f.fixups.head_pointer_words], idWords: f.fixups.id_words }, tableEnd, entry);
  const after = buildGraph(r.buffer);
  assert.deepEqual(after.objects.map(o => o.offset), g.objects.map(o => o.offset + 4));
  assert.equal(r.buffer.readUInt32BE(sec.offset + 0x0c), f.buf.readUInt32BE(sec.offset + 0x0c) + 1);        // count
  assert.equal(r.buffer.readUInt32BE(sec.offset + 0x14) & 0x7fffffff, tableEnd - sec.offset + 4);          // table end
  assert.equal(sec.offset + r.buffer.readUInt32BE(sec.offset + 0x1c), after.objects[0].offset);            // block end -> first object
  assert.equal(r.buffer.readUInt32BE(sec.offset + 0x20), after.objects[0].offset - sec.offset);            // table[0] -> owner
  assert.equal(r.buffer.readUInt32BE(f.owner + 4 + 0x14), f.physics + 4 - sec.offset);                    // owner -> physics
  assert.equal(r.buffer.readUInt32BE(f.physics + 4 + 0x2c), f.owner + 4 - sec.offset);                    // physics -> owner
  assert.equal(r.buffer.readUInt32BE(f.physics + 4 + 0x30), f.buf.readUInt32BE(f.physics + 0x30));         // string refs untouched
  assert.equal(after.sections[2].offset, g.sections[2].offset + 4);
  assert.deepEqual(r.pointerWords.slice(0, 3), f.fixups.pointer_words.map(w => w + 4));
});

test('planReachableClone copies owner+child, rebases internal pointers, registers a table entry and stays VALID', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-reloc-'));
  save(finding('test.spawn', 'CONFIRMED'), { dir });
  const f = fixture();
  const before = buildGraph(f.buf);
  const sec = before.sections[1];
  const r = planReachableClone(f.buf, f.fixups, { start: f.owner, end: f.physics + 0x40, findingId: 'test.spawn', edits: [{ offset: 0x30 + 0x20, type: 'f32be', value: 99.73 }], findingsOpts: { dir } });
  assert.equal(r.plan.validation.status, 'VALID', JSON.stringify(r.plan.validation.failures));
  assert.equal(r.plan.schema_valid, true, JSON.stringify(r.plan.schema_errors));
  assert.equal(r.plan.inserted_bytes % 0x20, 0);
  const after = buildGraph(r.buffer, { fields: true });
  const secA = after.sections[1];
  assert.equal(after.objects.length, before.objects.length + 2);
  const clone = after.objects.find(o => o.offset === r.plan.insert_at);
  assert.equal(clone.type, 3);
  const clonePhysics = after.objects.find(o => o.offset === r.plan.insert_at + 0x30);
  assert.equal(clonePhysics.type, 4);
  assert.equal(secA.offset + r.buffer.readUInt32BE(clone.offset + 0x14), clonePhysics.offset);             // internal pointer follows the copy
  const shift = r.plan.register_shift;
  assert.equal(shift, 0x20);                                                                               // section alignment
  assert.equal(secA.offset + r.buffer.readUInt32BE(clone.offset + 0x18), f.shared + shift);                // shared pointer -> shifted original
  assert.equal(secA.offset + r.buffer.readUInt32BE(clonePhysics.offset + 0x2c), clone.offset);             // back pointer -> clone owner
  assert.equal(r.buffer.readFloatBE(clonePhysics.offset + 0x20).toFixed(2), '99.73');
  assert.equal(r.buffer.readFloatBE(f.physics + shift + 0x20).toFixed(2), '91.73');                        // original untouched
  assert.equal((clone.offset - secA.offset) % 0x20, (f.owner - sec.offset) % 0x20);                     // alignment class preserved for the copy
  for (const o of before.objects) assert.equal((o.offset + shift - secA.offset) % 0x20, (o.offset - sec.offset) % 0x20); // every original keeps its alignment mod 32
  assert.equal(clonePhysics.fields.find(x => x.offset === clonePhysics.offset + 0x30).target, 'RockA_01_MAT');
  // registration
  const count = r.buffer.readUInt32BE(secA.offset + 0x0c);
  assert.equal(count, f.buf.readUInt32BE(sec.offset + 0x0c) + 1);
  assert.equal(r.buffer.readUInt32BE(secA.offset + 0x14) & 0x7fffffff, count * 4);
  assert.equal(secA.offset + r.buffer.readUInt32BE(r.plan.table_entry.location), clone.offset);
  assert.equal(secA.offset + r.buffer.readUInt32BE(secA.offset + 0x20), f.owner + shift);                  // old entry still -> original owner
  assert.equal(secA.offset + r.buffer.readUInt32BE(secA.offset + 0x1c), after.objects[0].offset);          // +0x1C -> first object, past the padding
  // fresh ids, unique
  const ids = after.objects.map(o => o.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(clone.id, Math.max(...before.objects.map(o => o.id)) + 1);
  assert.equal(after.sections.at(-1).offset + after.sections.at(-1).size, r.buffer.length);
});
