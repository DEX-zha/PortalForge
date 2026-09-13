import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildIgz } from './helpers/synthetic-igz.mjs';
import { save } from '../src/research/findings.mjs';
const finding = (id, confidence) => ({ id, category: 'world-entities', structure: 'test spawn', location: { file_pattern: 'x', offset: 0, length: 12 }, type: 'f32be x3', endian: 'be', meaning: 'test', evidence: [{ probe: 'p', summary: 's' }], confidence, editable: confidence === 'CONFIRMED', updated: '2026-09-13' });
import { buildGraph } from '../src/igz/graph.mjs';
import { scriptTable } from '../src/igz/script.mjs';
import { classify, setTransform, replacePlacement, listByLayer, getPlacement } from '../src/editor/placements.mjs';

// Synthetic level: two type-104 placements of equal span (a static crate and a scripted barrel), one layer, one model, one script.
function level() {
  const types = Array.from({ length: 105 }, (_, i) => i === 52 ? 'layer' : i === 64 ? 'model' : i === 92 ? 'script' : i === 104 ? 'placement' : i === 66 ? 'igNodeList' : 't' + i);
  const built = buildIgz({ types, strings: ['Crate_01', 'Props', 'C:/tfb/Content/Models/Objects/crate.mdl', 'Crate.ai', 'Barrel_01'],
    objects: [
      { type: 104, size: 0x100, fields: [{ at: 0x08, u32: 0x01000000 }, { at: 0x24, f32: 12.5 }, { at: 0x28, f32: 3 }, { at: 0x2c, f32: -7 }, { at: 0x34, f32: 90 }, { at: 0xb8, f32: 100 }, { at: 0xdc, obj: 3 }, { at: 0xe0, obj: 5 }] },   // static crate
      { type: 104, size: 0x100, fields: [{ at: 0x08, u32: 0x01000037 }, { at: 0x24, f32: 40 }, { at: 0x28, f32: 3 }, { at: 0x2c, f32: 40 }, { at: 0x34, f32: 0 }, { at: 0xb8, f32: 100 }, { at: 0xa8, obj: 4 }, { at: 0xdc, obj: 3 }, { at: 0xe0, obj: 6 }] },   // scripted barrel
      { type: 52, size: 0x40, fields: [{ at: 0x08, u32: 0x01000009 }, { at: 0x20, obj: 0 }, { at: 0x24, obj: 1 }] },                    // layer "Props"
      { type: 64, size: 0x20, fields: [{ at: 0x08, u32: 0x0100000f }] },                                                                // model
      { type: 92, size: 0x20, fields: [{ at: 0x08, u32: 0x01000037 }] },                                                                // script
      { type: 66, size: 0x20 }, { type: 66, size: 0x20 },                                                                               // companions
      // a third placement: the class detector wants three before it will believe a class holds placements
      { type: 104, size: 0x100, fields: [{ at: 0x08, u32: 0x01000000 }, { at: 0x24, f32: 5 }, { at: 0x28, f32: 1 }, { at: 0x2c, f32: 9 }, { at: 0x34, f32: 0 }, { at: 0xb8, f32: 100 }, { at: 0xdc, obj: 3 }] },
    ], headTable: [0, 1, 2, 3, 4, 7] });
  const [C, B, L, M, S, N1, N2] = built.objectOffsets;
  const buf = built.buf; const graph = buildGraph(buf, { fields: false });
  const fixups = { section_offset: built.sections.s1, pointer_words: [L + 0x20, L + 0x24, C + 0xdc, C + 0xe0, B + 0xa8, B + 0xdc, B + 0xe0] };
  const sec = graph.sections[graph.object_section];
  const lvl = { file: 'synthetic', buf, fixups, graph, table: scriptTable(buf, graph), ptrSet: new Set(fixups.pointer_words), sec };
  return { lvl, C, B, L, M, S, N1, N2 };
}

test('editor: listByLayer groups placements and classifies scripted ones as potentially unsafe', () => {
  const { lvl, C, B } = level();
  const res = listByLayer(lvl);
  assert.equal(res.layers.length, 1); assert.equal(res.layers[0].name, 'Props'); assert.equal(res.layers[0].count, 2); assert.equal(res.layers[0].scripted, 1); assert.equal(res.layers[0].static, 1);
  const crate = getPlacement(lvl, C), barrel = getPlacement(lvl, B);
  assert.equal(crate.safety.safety, 'static'); assert.equal(barrel.safety.safety, 'scripted / potentially unsafe'); assert.match(barrel.safety.reasons[0], /behaviour script/);
  assert.equal(classify({ name: 'CS_PortalEntry01', layers: ['OpeningCS'], script: null, model: null }).safety, 'marker / no model');
});

test('editor: setTransform changes only the requested floats, refuses scripted placements without --allow-scripted', () => {
  const { lvl, C, B } = level();
  const r = setTransform(lvl, C, { position: [1, 2, 3], heading: 45, scale: 50 });
  assert.equal(r.plan.validation.status, 'VALID'); assert.equal(r.buffer.length, lvl.buf.length);
  assert.equal(r.buffer.readFloatBE(C + 0x24), 1); assert.equal(r.buffer.readFloatBE(C + 0x2c), 3); assert.equal(r.buffer.readFloatBE(C + 0x34), 45); assert.equal(r.buffer.readFloatBE(C + 0xb8), 50);
  let changed = 0; for (let p = 0; p + 4 <= lvl.buf.length; p += 4) if (r.buffer.readUInt32BE(p) !== lvl.buf.readUInt32BE(p)) changed++;
  assert.equal(changed, 5);
  assert.throws(() => setTransform(lvl, B, { heading: 10 }), /allow-scripted/);
  assert.equal(setTransform(lvl, B, { heading: 10, allowScripted: true }).plan.validation.status, 'VALID');
  assert.throws(() => setTransform(lvl, C, {}), /nothing to change/);
});

test('editor: replacePlacement on unwrapped records uses the t104-generic recipe, keeps the slot name, refcount and companions, flags it as unconfirmed', () => {
  const { lvl, C, B, N2, M } = level();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-editor-')); save(finding('test.spawn', 'CONFIRMED'), { dir });
  // source = static crate, victim = scripted barrel slot (allowed: only the SOURCE safety is gated)
  const r = replacePlacement(lvl, C, B, { position: [5, 6, 7], findingId: 'test.spawn', findingsOpts: { dir } });
  assert.equal(r.plan.validation.status, 'VALID', JSON.stringify(r.plan.validation.failures));
  assert.match(r.plan.recipe, /t104-generic/); assert.ok(r.plan.validation.warnings.length);
  assert.equal(r.buffer.readUInt32BE(B + 0x08), 0x01000037);                       // slot name kept
  assert.equal(r.buffer.readUInt32BE(B + 0x04), lvl.buf.readUInt32BE(B + 0x04));   // slot refcount kept
  assert.equal(lvl.sec.offset + r.buffer.readUInt32BE(B + 0xe0), N2);              // slot companion kept
  assert.equal(r.buffer.readUInt32BE(B + 0xa8), lvl.buf.readUInt32BE(C + 0xa8));   // source has no script -> copied plain word
  assert.equal(lvl.sec.offset + r.buffer.readUInt32BE(B + 0xdc), M);               // model pointer copied
  assert.equal(r.buffer.readFloatBE(B + 0x24), 5); assert.equal(r.buffer.readFloatBE(B + 0x2c), 7);
  assert.deepEqual(r.plan.kept_fields, ['+0x8', '+0xe0']);
  assert.throws(() => replacePlacement(lvl, B, C, { findingId: 'test.spawn', findingsOpts: { dir } }), /allow-scripted/);   // scripted source refused
});
