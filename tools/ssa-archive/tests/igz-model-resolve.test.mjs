import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildIgz } from './helpers/synthetic-igz.mjs';
import { buildGraph } from '../src/igz/graph.mjs';
import { levelContext, detectClasses, resolveAll, resolveModel, validateAgainstFixups, FIELDS } from '../src/igz/model-resolve.mjs';
import { assessPlacement, assessReplacement, worst, blocked, SEVERITY } from '../src/editor/safety.mjs';

// A synthetic level: placements of class 77 (the index is arbitrary on purpose, the detector must not care),
// model records of class 12, one shared model, one marker without a model, one placement with a script.
function level({ placementType = 77, modelType = 12 } = {}) {
  const types = Array.from({ length: 120 }, (_, i) => 't' + i);
  const strings = ['Crate_01', 'C:/tfb/Content/Models/Objects/crate.mdl', 'Barrel_01', 'CS_Camera01', 'C:/tfb/Content/Levels/L/Scripts/PushBlock_Template.ai', 'Block_01', 'C:/tfb/Content/Models/Objects/barrel.mdl'];
  const at = []; let acc = 0; for (const s of strings) { at.push(acc); acc += s.length + 1; }
  const str = i => (0x01000000 | at[i]) >>> 0;   // section-2 string pointer, as the file stores names
  const P = 0x120;   // placement span, comfortably past +0xDC
  const built = buildIgz({ types, strings, objects: [
    // 0 crate: position, heading, scale, model -> obj 5
    { type: placementType, size: P, fields: [{ at: 0x08, u32: str(0) }, { at: 0x24, f32: 10 }, { at: 0x28, f32: 2 }, { at: 0x2c, f32: -3 }, { at: 0x34, f32: 90 }, { at: 0xb8, f32: 100 }, { at: 0xdc, obj: 5 }] },
    // 1 barrel: same model as the crate (shared)
    { type: placementType, size: P, fields: [{ at: 0x08, u32: str(2) }, { at: 0x24, f32: 20 }, { at: 0x28, f32: 2 }, { at: 0x2c, f32: 5 }, { at: 0x34, f32: 0 }, { at: 0xb8, f32: 100 }, { at: 0xdc, obj: 5 }] },
    // 2 marker: no model
    { type: placementType, size: P, fields: [{ at: 0x08, u32: str(3) }, { at: 0x24, f32: 1 }, { at: 0x28, f32: 1 }, { at: 0x2c, f32: 1 }, { at: 0x34, f32: 0 }, { at: 0xb8, f32: 100 }] },
    // 3 push block: a behaviour script at +0xA8 and its own model
    { type: placementType, size: P, fields: [{ at: 0x08, u32: str(5) }, { at: 0x24, f32: 4 }, { at: 0x28, f32: 0 }, { at: 0x2c, f32: 8 }, { at: 0x34, f32: 0 }, { at: 0xb8, f32: 100 }, { at: 0xa8, obj: 6 }, { at: 0xdc, obj: 4 }] },
    // 4 barrel model record
    { type: modelType, size: 0x20, fields: [{ at: 0x08, u32: str(6) }] },
    // 5 crate model record (shared by 0 and 1)
    { type: modelType, size: 0x20, fields: [{ at: 0x08, u32: str(1) }] },
    // 6 script record, named by its .ai path
    { type: 90, size: 0x20, fields: [{ at: 0x08, u32: str(4) }] },
  ], headTable: [0, 1, 2, 3, 4, 5, 6] });
  return built;
}

test('model-resolve detects the placement class structurally, whatever its type index, and resolves models', () => {
  for (const placementType of [77, 104, 195]) {
    const built = level({ placementType });
    const g = buildGraph(built.buf, { fields: false });
    const res = resolveAll(built.buf, g, null);
    assert.equal(res.file_has_placements, true, 'type ' + placementType);
    assert.equal(res.classes.placement_type, placementType);
    assert.equal(res.classes.model_type, 12);
    assert.equal(res.placements, 4);
    assert.equal(res.counts.direct, 3);
    assert.equal(res.counts.absent, 1);
    assert.equal(res.detection.chosen.strict, 3);
  }
});

test('model-resolve reports shared state: which model each placement uses, how many users, and who owns the bytes', () => {
  const built = level();
  const g = buildGraph(built.buf, { fields: false });
  const res = resolveAll(built.buf, g, null);
  const [crate, barrel, marker, block] = res.rows;
  assert.equal(crate.name, 'Crate_01');
  assert.deepEqual(crate.position, [10, 2, -3]);
  assert.equal(crate.rotation.heading, 90);
  assert.equal(crate.scale, 100);
  assert.match(crate.model.path, /crate\.mdl$/);
  assert.equal(crate.model.status, 'direct');
  assert.equal(crate.model.field, FIELDS.model);
  assert.equal(crate.shared_state.users, 2);                       // crate and barrel share one model record
  assert.equal(crate.shared_state.shared, true);
  assert.equal(barrel.shared_state.model_record, crate.shared_state.model_record);
  assert.equal(marker.model.status, 'absent');
  assert.equal(marker.shared_state, null);
  assert.match(block.behavior.path, /PushBlock_Template\.ai$/);
  assert.equal(block.shared_state.users, 1);
  assert.equal(res.shared_models, 1);
  assert.equal(crate.evidence.model, 'structural');                 // no fixup map was given
});

test('model-resolve finds an indirect model and flags an ambiguous one', () => {
  const built = level();
  const g = buildGraph(built.buf, { fields: false });
  const ctx = levelContext(built.buf, g, null);
  detectClasses(ctx);
  const [crate] = built.objectOffsets;
  const buf = Buffer.from(built.buf);
  const ctx2 = levelContext(buf, buildGraph(buf, { fields: false }), null); detectClasses(ctx2);
  const modelWord = buf.readUInt32BE(crate + FIELDS.model);
  buf.writeUInt32BE(0, crate + FIELDS.model);                       // drop the usual field
  buf.writeUInt32BE(modelWord, crate + 0x60);                       // and put the model somewhere else
  assert.equal(resolveModel(ctx2, crate).status, 'indirect');
  assert.equal(resolveModel(ctx2, crate).field, 0x60);
  const other = buf.readUInt32BE(built.objectOffsets[3] + FIELDS.model);
  buf.writeUInt32BE(other, crate + 0x70);                           // a second, different model reachable
  assert.equal(resolveModel(ctx2, crate).status, 'ambiguous');
  assert.equal(resolveModel(ctx2, crate).candidates.length, 2);
});

test('model-resolve agrees with a runtime fixup map when one is available', () => {
  const built = level();
  const g = buildGraph(built.buf, { fields: false });
  const [crate, barrel, , block] = built.objectOffsets;
  const fixups = { section_offset: built.sections.s1, pointer_words: [crate + FIELDS.model, barrel + FIELDS.model, block + FIELDS.model, block + FIELDS.behavior] };
  const v = validateAgainstFixups(built.buf, g, fixups);
  assert.equal(v.agreement, 1);
  assert.equal(v.false_positives.length, 0);
  assert.equal(v.missed.length, 0);
  const res = resolveAll(built.buf, g, fixups);
  assert.equal(res.rows[0].evidence.model, 'runtime-pointer');
  assert.equal(res.rows[3].evidence.behavior, 'runtime-pointer');
});

test('a file with no placement class reports it instead of inventing one', () => {
  const built = buildIgz({ objects: [{ type: 3, size: 0x20 }, { type: 4, size: 0x20 }], headTable: [0, 1] });
  const res = resolveAll(built.buf, buildGraph(built.buf, { fields: false }), null);
  assert.equal(res.file_has_placements, false);
  assert.equal(res.placements, 0);
});

test('safety rules: track-bound behaviour is critical, a plain script is medium, a shared model rewrite is critical, a span mismatch blocks', () => {
  const built = level();
  const g = buildGraph(built.buf, { fields: false });
  const res = resolveAll(built.buf, g, null);
  const [crate, , marker, block] = res.rows;
  const blockRules = assessPlacement(block, { hasRuntimeMap: true });
  assert.equal(blockRules[0].id, 'TRACK_BOUND_BEHAVIOUR');
  assert.equal(blockRules[0].severity, 'critical');
  assert.equal(worst(blockRules), 'critical');
  const scripted = assessPlacement({ ...block, behavior: { path: 'C:/x/Scripts/027_WindmillProp.ai' } }, { hasRuntimeMap: true });
  assert.equal(scripted[0].id, 'SCRIPTED_PLACEMENT');
  assert.equal(scripted[0].severity, 'medium');                      // one boot moved it fine, one froze: unproven
  assert.equal(assessPlacement(marker, { hasRuntimeMap: true })[0].id, 'MARKER_NO_MODEL');
  assert.ok(assessPlacement(crate, { hasRuntimeMap: false }).some(r => r.id === 'NO_RUNTIME_MAP'));
  const shared = assessReplacement(crate, block, { hasRuntimeMap: true, sharedInVictim: [{ offset: 0x100, users: 26, path: 'C:/tfb/Content/Models/Objects/plants_weed2_whole.mdl' }] });
  assert.equal(shared[0].id, 'SHARED_MODEL_REWRITE');
  assert.equal(shared[0].severity, 'critical');
  assert.ok(shared.some(r => r.id === 'VICTIM_TRACK_BOUND_BEHAVIOUR'));
  const contained = assessReplacement(crate, marker, { hasRuntimeMap: true, sharedInVictim: [{ offset: 0x100, users: 1, path: 'crate.mdl' }] });
  assert.equal(contained[0].id, 'OWN_RECORD_REWRITE');
  assert.equal(blocked(contained), false);
  const mismatch = assessReplacement(crate, marker, { spanMatch: false, copied: { source: 0x120, victim: 0x80 } });
  assert.equal(mismatch[0].id, 'SPAN_MISMATCH');
  assert.equal(blocked(mismatch), true);
  assert.deepEqual(SEVERITY, ['blocking', 'critical', 'high', 'medium', 'info']);
});

test('placement v1 is frozen: every produced record validates against placement-v1.schema.json', async () => {
  const { schemaValidator, contracts002 } = await import('../src/workspace/manifest.mjs');
  const validate = schemaValidator('placement-v1.schema.json', contracts002);
  const built = level();
  const res = resolveAll(built.buf, buildGraph(built.buf, { fields: false }), null);
  for (const r of res.rows) assert.ok(validate(r), `row 0x${r.offset.toString(16)}: ${JSON.stringify(validate.errors)}`);
  assert.equal(res.rows[0].model_version, 1);
  // the frozen shape must not grow silently: additionalProperties is false, so an extra key fails
  assert.equal(validate({ ...res.rows[0], surprise: 1 }), false);
  // and a missing one too
  const { layers, ...withoutLayers } = res.rows[0];
  assert.equal(validate(withoutLayers), false);
});

test('layers: a named list record that references a placement is a layer; scripts, models and other placements are not', async () => {
  const { levelContext: lc, detectClasses: dc, placementReferrers, layersOf } = await import('../src/igz/model-resolve.mjs');
  const strings = ['Crate_01', 'C:/tfb/Content/Models/Objects/crate.mdl', 'Plants', 'C:/tfb/Content/Levels/L/Scripts/Hat_Pickup.ai', 'Level_027_plants.lvl'];
  const at = []; let acc = 0; for (const s of strings) { at.push(acc); acc += s.length + 1; }
  const str = i => (0x01000000 | at[i]) >>> 0;
  const built = buildIgz({ types: Array.from({ length: 120 }, (_, i) => 't' + i), strings, objects: [
    { type: 77, size: 0x120, fields: [{ at: 0x08, u32: str(0) }, { at: 0x24, f32: 5 }, { at: 0x28, f32: 1 }, { at: 0x2c, f32: 9 }, { at: 0x34, f32: 0 }, { at: 0xb8, f32: 100 }, { at: 0xdc, obj: 1 }] },
    { type: 12, size: 0x20, fields: [{ at: 0x08, u32: str(1) }] },                                   // model record
    { type: 77, size: 0x120, fields: [{ at: 0x08, u32: str(0) }, { at: 0x24, f32: 6 }, { at: 0x28, f32: 1 }, { at: 0x2c, f32: 9 }, { at: 0x34, f32: 0 }, { at: 0xb8, f32: 100 }, { at: 0xdc, obj: 1 }] },
    { type: 77, size: 0x120, fields: [{ at: 0x08, u32: str(0) }, { at: 0x24, f32: 7 }, { at: 0x28, f32: 1 }, { at: 0x2c, f32: 9 }, { at: 0x34, f32: 0 }, { at: 0xb8, f32: 100 }, { at: 0xdc, obj: 1 }] },
    { type: 40, size: 0x40, fields: [{ at: 0x08, u32: str(2) }, { at: 0x20, obj: 0 }] },              // "Plants" list -> the first placement
    { type: 90, size: 0x40, fields: [{ at: 0x08, u32: str(3) }, { at: 0x20, obj: 0 }] },              // a .ai script also referencing it
    { type: 41, size: 0x40, fields: [{ at: 0x08, u32: str(4) }, { at: 0x20, obj: 0 }] },              // "Level_027_plants.lvl" registry
  ], headTable: [0, 1, 2, 3, 4, 5, 6] });
  const g = buildGraph(built.buf, { fields: false });
  const ctx = lc(built.buf, g, null); dc(ctx);
  const [P] = built.objectOffsets;
  const refs = placementReferrers(ctx, [P]);
  const layers = layersOf(ctx, P, refs).sort();
  assert.deepEqual(layers, ['Level_027_plants.lvl', 'Plants']);      // the .ai referrer is excluded
  const res = resolveAll(built.buf, g, null);
  assert.deepEqual(res.rows[0].layers.sort(), ['Level_027_plants.lvl', 'Plants']);
  assert.equal(res.rows[0].evidence.layers, 'structural');
});

test('corpusReport aggregates rates, schema conformance and safety over several files', async () => {
  const { corpusReport, formatCorpus } = await import('../src/igz/corpus.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-corpus-'));
  const a = path.join(dir, 'a.igz'), b = path.join(dir, 'b.igz');
  fs.writeFileSync(a, level({ placementType: 77 }).buf);
  fs.writeFileSync(b, level({ placementType: 195 }).buf);            // the same level under a different class index
  const rep = corpusReport([a, b]);
  assert.equal(rep.model_version, 1);
  assert.equal(rep.totals.files, 2);
  assert.equal(rep.totals.failed, 0);
  assert.equal(rep.totals.placements, 8);                            // 4 placements per file
  assert.equal(rep.totals.direct, 6);
  assert.equal(rep.totals.absent, 2);
  assert.equal(rep.totals.ambiguous, 0);
  assert.equal(rep.totals.schema_invalid, 0);
  assert.equal(rep.totals.rates.resolved, 75);
  assert.equal(rep.totals.rates.schema_valid, 100);
  assert.equal(rep.rows[0].detected.placement_type, 77);
  assert.equal(rep.rows[1].detected.placement_type, 195);            // detection is per file, not global
  assert.ok(rep.totals.safety.critical >= 2);                        // the push block in each file
  assert.match(formatCorpus(rep), /placement model v1 over 2 file\(s\)/);
});
