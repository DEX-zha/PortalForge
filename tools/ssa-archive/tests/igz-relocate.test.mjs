import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildIgz } from './helpers/synthetic-igz.mjs';
import { buildGraph } from '../src/igz/graph.mjs';
import { insertBytes, planReachableClone, planOverwriteClone } from '../src/igz/relocate.mjs';
import { save } from '../src/research/findings.mjs';

// The graph detector recognises headers with refcount 1 only; bumped refcounts are restored for re-parsing.
const shiftOf = r => r.plan.register_shift;
const parseView = r => { const c = Buffer.from(r.buffer); for (const u of r.plan.refcounts) c.writeUInt32BE(u.old, u.location); return c; };

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

test('planOverwriteClone registers the clone in place: same file length, only the target blob and refcount words change, no table growth', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-ovw-'));
  save(finding('test.spawn', 'CONFIRMED'), { dir });
  // owner(type3)+physics(type4) block; a shared type1; a same-type victim registered in the table whose
  // blob (to the next table entry) is large enough to hold the block.
  const built = buildIgz({
    objects: [
      { type: 3, size: 0x30, fields: [{ at: 0x14, obj: 1 }, { at: 0x18, obj: 2 }] },   // owner
      { type: 4, size: 0x40, fields: [{ at: 0x2c, obj: 0 }, { at: 0x30, str: 2 }] },    // physics
      { type: 1, size: 0x20, fields: [{ at: 0x10, str: 1 }] },                          // shared
      { type: 3, size: 0x90, fields: [] },                                              // victim (table entry)
      { type: 1, size: 0x20, fields: [] },                                             // next table entry
    ], headTable: [3, 4],
  });
  const [owner, physics, shared, victim] = built.objectOffsets;
  const fixups = { section_offset: built.sections.s1, pointer_words: [owner + 0x14, owner + 0x18, physics + 0x2c], head_pointer_words: built.headPointerWords, id_words: [], cross_pointer_words: [] };
  const before = buildGraph(built.buf);
  const r = planOverwriteClone(built.buf, fixups, { start: owner, end: physics + 0x40, findingId: 'test.spawn', target: victim, edits: [{ offset: 0x1c, type: 'u32be', value: 0x1234 }], findingsOpts: { dir } });
  assert.equal(r.plan.validation.status, 'VALID', JSON.stringify(r.plan.validation.failures));
  assert.equal(r.buffer.length, built.buf.length);                                     // no shift, same length
  const sec = before.sections[1];
  const blobEnd = victim + 0x90;                                                        // next table entry is 0x90 after
  // every changed word lies inside the victim blob, except refcount words (+4 of a shared target)
  const rc = new Set(r.plan.refcounts.map(u => u.location));
  for (let p = sec.offset; p + 4 <= built.buf.length; p += 4) {
    if (p >= victim && p < blobEnd) continue;
    if (rc.has(p)) continue;
    assert.equal(r.buffer.readUInt32BE(p), built.buf.readUInt32BE(p), `unexpected change at 0x${p.toString(16)}`);
  }
  const after = buildGraph(r.buffer);
  assert.equal(after.objects.length, before.objects.length);                           // count unchanged (in-place)
  const clone = after.objects.find(o => o.offset === victim);
  assert.equal(clone.type, 3);                                                          // clone owner at the target
  assert.equal(after.sections[1].offset, before.sections[1].offset);                    // table/sections not moved
  assert.equal(r.buffer.readUInt32BE(shared + 4), built.buf.readUInt32BE(shared + 4) + 1); // shared external +1
  assert.equal(sec.offset + r.buffer.readUInt32BE(victim + 0x14), victim + 0x30);        // clone owner -> its physics (rebased in place)
});

test('planReachableClone can insert the block before an object: later objects move by the block length, pointers follow, refcounts grow', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-reloc-'));
  save(finding('test.spawn', 'CONFIRMED'), { dir });
  const f = fixture();
  const before = buildGraph(f.buf); const sec = before.sections[1];
  const r = planReachableClone(f.buf, f.fixups, { start: f.owner, end: f.physics + 0x40, findingId: 'test.spawn', register: false, insertBefore: f.shared, findingsOpts: { dir } });
  assert.equal(r.plan.validation.status, 'VALID', JSON.stringify(r.plan.validation.failures));
  assert.equal(r.plan.insert_at, f.shared);                                  // no pre-pad inside the range
  assert.equal(r.plan.inserted_bytes % 0x20, 0);
  const after = buildGraph(parseView(r)); const secA = after.sections[1];
  const blockLen = 0x70;
  const sharedNew = f.shared + blockLen;
  assert.equal(after.objects.length, 5);
  assert.deepEqual(after.objects.map(o => o.type), [3, 4, 3, 4, 1]);
  assert.equal(secA.offset + r.buffer.readUInt32BE(f.owner + 0x18), sharedNew);                  // original owner -> moved shared
  assert.equal(secA.offset + r.buffer.readUInt32BE(r.plan.insert_at + 0x18), sharedNew);         // clone -> moved shared
  assert.equal(secA.offset + r.buffer.readUInt32BE(r.plan.insert_at + 0x14), r.plan.insert_at + 0x30); // clone -> its own physics
  assert.equal(r.buffer.readUInt32BE(sharedNew + 4), 2);                                          // refcount 1 -> 2
  assert.equal(r.plan.refcounts.length, 1);
  assert.equal(r.buffer.readUInt32BE(secA.offset + 0x0c), f.buf.readUInt32BE(sec.offset + 0x0c)); // table untouched
  assert.equal(secA.offset + r.buffer.readUInt32BE(secA.offset + 0x1c), after.objects[0].offset);
  assert.equal(after.sections.at(-1).offset + after.sections.at(-1).size, r.buffer.length);
  // the padding sits after the last object, not between objects
  const last = after.objects.at(-1);
  assert.equal(secA.offset + secA.size - (last.offset + 0x20), r.plan.end_pad);
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
  const after = buildGraph(parseView(r), { fields: true });
  const secA = after.sections[1];
  assert.equal(r.buffer.readUInt32BE(f.shared + shiftOf(r) + 4), 2);                                  // shared object gained one owner
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
  // header word +8 is a shared string pointer, kept as in the source
  assert.equal(clone.id, before.objects[0].id);
  assert.equal(clonePhysics.id, before.objects[1].id);
  assert.equal(after.sections.at(-1).offset + after.sections.at(-1).size, r.buffer.length);
});

test('planLinkClone duplicates a chain node: copy inserted before the tail, predecessor link redirected, copy links to the old next, no table change', async () => {
  const { planLinkClone } = await import('../src/igz/relocate.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-link-'));
  save(finding('test.spawn', 'CONFIRMED'), { dir });
  // chain A -> B -> C via +0x14; a tail record T after them (the insert point); table lists T only
  const built = buildIgz({
    objects: [
      { type: 3, size: 0x30, fields: [{ at: 0x14, obj: 1 }] },   // A
      { type: 3, size: 0x30, fields: [{ at: 0x14, obj: 2 }] },   // B  (source P)
      { type: 3, size: 0x30, fields: [] },                       // C  (old next)
      { type: 1, size: 0x20, fields: [] },                       // T  (tail, table entry)
    ], headTable: [3],
  });
  const [A, B, C, T] = built.objectOffsets;
  const fixups = { section_offset: built.sections.s1, pointer_words: [A + 0x14, B + 0x14], head_pointer_words: built.headPointerWords, id_words: [], cross_pointer_words: [] };
  const before = buildGraph(built.buf); const sec = before.sections[1];
  const r = planLinkClone(built.buf, fixups, { source: B, linkField: 0x14, findingId: 'test.spawn', insertBefore: T, findingsOpts: { dir } });
  assert.equal(r.plan.validation.status, 'VALID', JSON.stringify(r.plan.validation.failures));
  assert.equal(r.plan.insert_at, T);
  const after = buildGraph(r.buffer); const secA = after.sections[1];
  assert.equal(after.objects.length, before.objects.length + 1);
  assert.equal(secA.offset + r.buffer.readUInt32BE(B + 0x14), T);                 // P.next -> clone
  assert.equal(secA.offset + r.buffer.readUInt32BE(T + 0x14), C);                 // clone.next -> old next
  assert.equal(r.buffer.readUInt32BE(T + 4), 1);                                  // clone refcount 1
  assert.equal(secA.offset + r.buffer.readUInt32BE(A + 0x14), B);                 // A.next untouched
  const movedT = after.objects.find(o => o.offset === T + 0x30); assert.equal(movedT.type, 1);           // tail moved by the copy length
  assert.equal(secA.offset + r.buffer.readUInt32BE(secA.offset + 0x20), T + 0x30);                     // table entry follows the moved tail
  assert.equal(r.buffer.readUInt32BE(secA.offset + 0x0c), built.buf.readUInt32BE(sec.offset + 0x0c));   // table count unchanged
  assert.equal(after.sections.at(-1).offset + after.sections.at(-1).size, r.buffer.length);
  assert.equal(r.plan.moved_records, 1);
});

test('planReplaceNode duplicates a chain node in place: only the victim block changes, chain pred -> P -> copy -> victim.next, no shift', async () => {
  const { planReplaceNode } = await import('../src/igz/relocate.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-repl-'));
  save(finding('test.spawn', 'CONFIRMED'), { dir });
  const built = buildIgz({ objects: [
    { type: 3, size: 0x30, fields: [{ at: 0x14, obj: 1 }, { at: 0x20, u32: 0x11111111 }] },   // A (pred)
    { type: 3, size: 0x30, fields: [{ at: 0x14, obj: 2 }, { at: 0x20, u32: 0x22222222 }] },   // P
    { type: 3, size: 0x30, fields: [{ at: 0x14, obj: 3 }, { at: 0x20, u32: 0x33333333 }] },   // V (victim = P.next)
    { type: 3, size: 0x30, fields: [{ at: 0x20, u32: 0x44444444 }] },                         // W (V.next)
  ], headTable: [3] });
  const [A, P, V, Wo] = built.objectOffsets;
  const fixups = { section_offset: built.sections.s1, pointer_words: [A + 0x14, P + 0x14, V + 0x14], head_pointer_words: built.headPointerWords, id_words: [], cross_pointer_words: [] };
  const r = planReplaceNode(built.buf, fixups, { source: P, linkField: 0x14, findingId: 'test.spawn', findingsOpts: { dir } });
  assert.equal(r.plan.validation.status, 'VALID', JSON.stringify(r.plan.validation.failures));
  assert.equal(r.plan.victim, V);
  assert.equal(r.buffer.length, built.buf.length);
  const sec = buildGraph(built.buf).sections[1];
  for (let p = 0; p + 4 <= built.buf.length; p += 4) { if (p >= V && p < V + 0x30) continue; assert.equal(r.buffer.readUInt32BE(p), built.buf.readUInt32BE(p), 'unexpected change at 0x' + p.toString(16)); }
  assert.equal(r.buffer.readUInt32BE(V + 0x20), 0x22222222);                        // copy carries P's content
  assert.equal(r.buffer.readUInt32BE(V + 4), 1);                                     // refcount 1
  assert.equal(sec.offset + r.buffer.readUInt32BE(V + 0x14), Wo);                    // copy.next = victim's old next
  assert.equal(sec.offset + r.buffer.readUInt32BE(P + 0x14), V);                     // P.next still -> slot
  assert.equal(sec.offset + r.buffer.readUInt32BE(A + 0x14), P);                     // pred untouched
  assert.equal(buildGraph(r.buffer).objects.length, 4);
});
