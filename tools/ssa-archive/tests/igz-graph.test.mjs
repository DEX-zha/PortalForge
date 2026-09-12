import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIgz } from './helpers/synthetic-igz.mjs';
import { parseIgzHeader } from '../src/igz/header.mjs';
import { buildGraph, validateGraph, histogram } from '../src/igz/graph.mjs';

const sample = () => buildIgz({ objects: [
  { type: 4, size: 0x40, fields: [{ at: 0x30, str: 2 }, { at: 0x20, f32: 91.73 }, { at: 0x24, f32: 10.31 }, { at: 0x28, f32: 44.74 }] },
  { type: 3, size: 0x30, fields: [{ at: 0x10, str: 1 }, { at: 0x14, obj: 0 }, { at: 0x18, u32: 0x80000004 }] },
  { type: 1, size: 0x20 },
], inlineTail: 0x10 });

test('header and section table parse; last section ends at EOF; second header found', () => {
  const { buf, sections } = sample();
  const h = parseIgzHeader(buf);
  assert.deepEqual(h.issues, []);
  assert.equal(h.sections.length, 3);
  assert.equal(h.sections[0].offset, sections.s0);
  assert.equal(h.sections[2].align, 2);
  assert.equal(h.second_header.words[0], 0x49475A01);
  const bad = Buffer.from(buf); bad.writeUInt32BE(0x41424344, 0);
  assert.ok(parseIgzHeader(bad).issues.some(i => i.reason === 'BAD_IGZ_MAGIC'));
  const truncated = buf.subarray(0, buf.length - 3);
  assert.ok(parseIgzHeader(truncated).issues.some(i => i.reason === 'SECTION_END_MISMATCH'));
});

test('type table keeps empty names and reads size hints; objects enumerate with accounting == total', () => {
  const { buf, objectOffsets } = sample();
  const g = buildGraph(buf, { fields: true });
  assert.deepEqual(g.types.map(t => t.name), ['metaobject', 'tfbLightInfo', '', 'PlacementReference', 'tfbPhysicsModel']);
  assert.equal(g.types[4].size_hint, 0x18 + 8 * 4);
  assert.equal(g.objects.length, 3);
  assert.deepEqual(g.objects.map(o => o.offset), objectOffsets);
  assert.equal(g.objects[0].type_name, 'tfbPhysicsModel');
  assert.equal(g.objects[0].id, 0x01000001);
  assert.equal(g.accounting.objects + g.accounting.unparsed + g.accounting.padding, g.accounting.total);
  assert.ok(g.unparsed.some(u => u.size === 0x20), 'lead-in reported as unparsed');
  assert.equal(validateGraph(g).valid, true, JSON.stringify(validateGraph(g).errors));
  const h = histogram(g);
  assert.equal(h[0].count, 1);
});

test('references resolve: strings (section-2 relative, 0 = null), objects, flagged words, floats', () => {
  const { buf } = sample();
  const g = buildGraph(buf, { fields: true });
  const phys = g.objects[0], plc = g.objects[1];
  const pos = phys.fields.filter(f => f.kind === 'f32').map(f => f.value);
  assert.deepEqual(pos, [91.73, 10.31, 44.74]);
  assert.equal(phys.fields.find(f => f.offset === phys.offset + 0x30).target, 'RockA_01_MAT');
  assert.equal(plc.fields.find(f => f.offset === plc.offset + 0x10).target, 'Scene Graph');
  const oref = plc.fields.find(f => f.offset === plc.offset + 0x14);
  assert.equal(oref.kind, 'object_ref'); assert.equal(oref.target.type_name, 'tfbPhysicsModel');
  const flagged = plc.fields.find(f => f.offset === plc.offset + 0x18);
  assert.equal(flagged.kind, 'flagged_ref'); assert.equal(flagged.target.low24, 4);
  assert.ok(phys.fields.filter(f => f.value === 0).every(f => f.kind === 'unknown'), 'zero words are never string refs');
});

test('a non-IGZ buffer is refused with exit code 2 semantics', () => {
  assert.throws(() => buildGraph(Buffer.from('IGA\x1a\x04\x00\x00\x00' + '\0'.repeat(64), 'latin1')), e => e.exitCode === 2);
});
