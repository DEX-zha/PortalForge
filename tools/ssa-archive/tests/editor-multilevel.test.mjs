import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syntheticLevel } from './helpers/synthetic-level.mjs';
import { openSession, applyEdit, interchangeable } from '../src/editor/session.mjs';
import { save } from '../src/editor/save.mjs';
import { assessPlacement } from '../src/editor/safety.mjs';

// Feature 003 T050. The risk this feature carries is not that duplication is hard; it is that the whole editor
// quietly assumes the tutorial. These tests open a level the editor was never built against, and one with no
// runtime evidence at all, and check that nothing silently falls back to what the tutorial happens to have.

const here = path.dirname(fileURLToPath(import.meta.url));
const MINING = path.resolve(here, '../../../.local/workspaces/mining-bld/entries/3-level.bld.decoded');
const TUTORIAL = path.resolve(here, '../../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded');
const haveSamples = fs.existsSync(MINING) && fs.existsSync(TUTORIAL);
const gates = { gates: () => ({ status: 'PASS' }) };

test('a level the editor was never built against opens with no per-level configuration', { skip: !haveSamples && 'local samples absent' }, () => {
  const s = openSession(MINING, { archive: 'level/Level_000_Mining.bld', entry: 3, deps: gates });
  assert.equal(s.placements.length, 617);
  assert.equal(s.detection.placement_type, 98, 'detected, not the tutorial 104');
  assert.equal(s.counts.direct, 374);
  assert.equal(s.counts.ambiguous, 0);
  assert.ok(s.layers.length > 100);
  assert.ok(s.layers.some(l => l.name === 'Loot'));
  for (const p of s.placements) assert.equal(p.model_version, 1);
});

test('the two levels resolve different classes, so nothing is carried over from one to the other', { skip: !haveSamples && 'local samples absent' }, () => {
  const mining = openSession(MINING, { archive: 'a', entry: 3, deps: gates });
  const tutorial = openSession(TUTORIAL, { archive: 'b', entry: 3, deps: gates });
  assert.notEqual(mining.detection.placement_type, tutorial.detection.placement_type);
  assert.notEqual(mining.detection.model_type, tutorial.detection.model_type);
  assert.notEqual(mining.placements.length, tutorial.placements.length);
});

test('without a runtime map every pointer-derived attribute says so, and none is dressed up', { skip: !haveSamples && 'local samples absent' }, () => {
  const s = openSession(MINING, { archive: 'a', entry: 3, deps: gates });
  assert.equal(s.has_runtime_map, false);
  for (const p of s.placements) {
    assert.notEqual(p.evidence.model, 'runtime-pointer');
    assert.notEqual(p.evidence.behavior, 'runtime-pointer');
    assert.notEqual(p.evidence.layers, 'runtime-pointer');
    if (p.model.path) assert.equal(p.evidence.model, 'structural');
  }
  const any = s.placements.find(p => p.model.path);
  assert.ok(assessPlacement(any, { hasRuntimeMap: false }).some(r => r.id === 'NO_RUNTIME_MAP'));
});

test('a transform still works without a runtime map, because reading the layout does not need one', { skip: !haveSamples && 'local samples absent' }, () => {
  const s = openSession(MINING, { archive: 'a', entry: 3, deps: gates });
  const p = s.placements.find(x => x.model.path && !x.behavior);
  const start = [...p.position];                       // the record is refreshed in place, so capture it first
  const r = applyEdit(s, { kind: 'transform', target: p.offset, position: [start[0], start[1] + 8, start[2]] });
  assert.equal(r.placement.position[1], Math.round((start[1] + 8) * 1000) / 1000);
  assert.equal(r.placement, p, 'the session refreshes the record it holds rather than handing out a copy');
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-ml-')), 'edited.decoded');
  const w = save(s, { out });
  assert.equal(w.plan.status, 'VALID');
  assert.equal(w.plan.bytes_changed_outside, 0);
  const a = fs.readFileSync(MINING), b = fs.readFileSync(out);
  let differing = 0;
  for (let q = 0; q + 4 <= a.length; q += 4) if (a.readUInt32BE(q) !== b.readUInt32BE(q)) differing++;
  assert.equal(differing, 3, 'three position words and nothing else');
});

test('duplication without a runtime map is refused, because rewriting pointers needs evidence reading does not', { skip: !haveSamples && 'local samples absent' }, () => {
  const s = openSession(MINING, { archive: 'a', entry: 3, deps: gates });
  const a = s.placements.find(p => s.placements.some(q => q.offset !== p.offset && interchangeable(s, p.offset, q.offset)));
  const b = s.placements.find(q => q.offset !== a.offset && interchangeable(s, a.offset, q.offset));
  assert.ok(a && b, 'the level does have interchangeable slots, so the refusal is about evidence and not about size');
  assert.throws(() => applyEdit(s, { kind: 'replace', target: b.offset, source: a.offset }),
    e => e.error === 'RUNTIME_MAP_REQUIRED');
});

test('a save refuses an unwritable destination with a reason rather than an internal error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-ml2-'));
  const file = path.join(dir, 'level.decoded');
  fs.writeFileSync(file, syntheticLevel().buf);
  const s = openSession(file, { archive: 'a', entry: 3, deps: gates });
  applyEdit(s, { kind: 'transform', target: s.placements[0].offset, heading: 12 });
  const r = save(s, { out: path.join(file, 'not-a-directory', 'x.decoded') });   // a file used as a directory
  assert.equal(r.plan.status, 'INVALID');
  assert.equal(r.written, null);
  assert.ok(r.plan.failures.some(f => /could not be written/.test(f.reason)));
});

test('the runtime map changes what the editor CLAIMS, never what it writes', { skip: !haveSamples && 'local samples absent' }, () => {
  // This is what makes a boot of the structural path pointless, and it is worth guarding: if the two paths ever
  // diverge, a level read structurally would be edited differently from the same level read with its map, and
  // nothing in game would tell us which one was right.
  const map = JSON.parse(fs.readFileSync(path.resolve(here, '../../../.local/dolphin-evidence/ptr-scan3-fixups.json'), 'utf8'));
  const edit = fixups => {
    const s = openSession(TUTORIAL, { archive: 'a', entry: 3, fixups, deps: gates });
    const p = s.placements.find(x => x.offset === 0x3495e4);
    applyEdit(s, { kind: 'transform', target: p.offset, position: [p.position[0], 16, p.position[2]], heading: 200, scale: 150 });
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-eq-')), 'edited.decoded');
    return { s, written: save(s, { out }).written };
  };
  const withMap = edit(map), without = edit(null);

  assert.ok(fs.readFileSync(withMap.written).equals(fs.readFileSync(without.written)),
    'the same edit through the structural path must produce the same bytes');
  assert.equal(withMap.s.placements.length, without.s.placements.length);
  for (const p of withMap.s.placements) {
    const q = without.s.placements.find(x => x.offset === p.offset);
    assert.equal(q.model.offset, p.model.offset, `model differs at 0x${p.offset.toString(16)}`);
    assert.equal(q.model.status, p.model.status);
    assert.deepEqual(q.layers, p.layers);
  }
  // What the map does change is the claim, and only the claim.
  const a = withMap.s.placements.find(p => p.model.path), b = without.s.placements.find(p => p.offset === a.offset);
  assert.equal(a.evidence.model, 'runtime-pointer');
  assert.equal(b.evidence.model, 'structural');
});
