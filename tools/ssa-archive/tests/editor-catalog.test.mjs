import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syntheticLevel, syntheticFixups } from './helpers/synthetic-level.mjs';
import { openSession, applyEdit, undo, redo, resetScene, planReplace } from '../src/editor/session.mjs';
import { catalog, prepareDrop, commitDrop } from '../src/editor/catalog.mjs';
import { startServer } from '../src/editor/server.mjs';
import { filterCatalog } from '../src/view/catalog.mjs';

function fixture(t) {
  const built = syntheticLevel(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-catalog-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'level.decoded'); fs.writeFileSync(file, built.buf);
  return openSession(file, { fixups: syntheticFixups(built), deps: { gates: () => ({ status: 'PASS' }) } });
}
const intent = s => ({ source: s.placements[0].offset, target: s.placements[3].offset, position: [42, 3, 9] });

test('catalog covers every placement and explains unavailable sources', t => {
  const s = fixture(t), rows = catalog(s).entries;
  assert.equal(rows.length, s.placements.length);
  assert.equal(rows[0].available, true);
  assert.ok(rows.some(r => !r.available && r.reason));
  s.has_runtime_map = false;
  assert.ok(catalog(s).entries.every(r => !r.available));
});
test('preparing a non-critical plan returns the actual plan without changing bytes or history', t => {
  const s = fixture(t), before = Buffer.from(s.buffer);
  const p = planReplace(s, { kind: 'replace', ...intent(s) });
  assert.equal(p.plan?.validation.status, 'VALID');
  const draft = prepareDrop(s, intent(s));
  assert.ok(draft.token); assert.ok(draft.plan);
  assert.deepEqual(s.buffer, before); assert.equal(s.edits.length, 0); assert.equal(s.dirty, false);
});
test('confirmed drop is one reversible edit and consumes its token', t => {
  const s = fixture(t), before = Buffer.from(s.buffer), i = intent(s), source = structuredClone(s.placements[0]);
  const draft = prepareDrop(s, i), result = commitDrop(s, { token: draft.token, acknowledged: [] });
  assert.equal(result.rebuild_scene, true); assert.equal(s.edits.length, 1);
  assert.deepEqual(result.placement.position, i.position);
  assert.deepEqual(s.placements.find(p => p.offset === source.offset), source);
  const after = Buffer.from(s.buffer);
  assert.throws(() => commitDrop(s, { token: draft.token }), /STALE_PLAN/);
  assert.equal(undo(s).rebuild_scene, true); assert.deepEqual(s.buffer, before);
  assert.equal(redo(s).rebuild_scene, true); assert.deepEqual(s.buffer, after);
});
test('stale, locked, invalid and scripted drops cannot write', t => {
  const s = fixture(t), i = intent(s), draft = prepareDrop(s, i);
  applyEdit(s, { kind: 'transform', target: i.source, position: [8, 9, 10] });
  assert.throws(() => commitDrop(s, { token: draft.token }), /STALE_PLAN/);
  s.locked = true;
  assert.throws(() => prepareDrop(s, i), /SESSION_LOCKED/);
  s.locked = false;
  assert.throws(() => prepareDrop(s, { ...i, position: [NaN, 2, 3] }), /BAD_VALUE/);
  s.placements[0].behavior = { path: 'script.ai' };
  assert.throws(() => prepareDrop(s, i), /SOURCE_UNAVAILABLE/);
});

test('an edit followed by undo still invalidates a prepared transaction', t => {
  const s = fixture(t), i = intent(s), before = Buffer.from(s.buffer), draft = prepareDrop(s, i);
  applyEdit(s, { kind: 'transform', target: i.source, position: [8, 9, 10] }); undo(s);
  assert.deepEqual(s.buffer, before);
  assert.throws(() => commitDrop(s, { token: draft.token }), /STALE_PLAN/);
});

test('catalog search combines case-insensitive words, layers and availability without merging names', () => {
  const rows = [
    { offset: 1, name: 'Plant', model: 'Sunflower.mdl', layers: ['Garden'], category: 'static', available: true },
    { offset: 2, name: 'Plant', model: 'Sunflower.mdl', layers: ['Garden'], category: 'resource', available: false },
  ];
  assert.equal(filterCatalog(rows, 'SUNFLOWER garden').length, 2);
  assert.deepEqual(filterCatalog(rows, 'plant', 'available').map(p => p.offset), [1]);
  assert.deepEqual(filterCatalog(rows, '', 'resource').map(p => p.offset), [2]);
  assert.equal(filterCatalog(rows, 'missing').length, 0);
});

test('catalog HTTP contract prepares without writing and commits only the server intent', async t => {
  const s = fixture(t), server = await startServer({ session: s, port: 0 });
  t.after(() => server.close());
  const post = (route, body) => fetch(server.url + '/api/catalog/' + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await (await fetch(server.url + '/api/catalog')).json()).entries.length, 4);
  const i = intent(s), draft = await (await post('prepare', i)).json();
  assert.equal(s.edits.length, 0);
  s.locked = true; assert.equal((await post('commit', { token: draft.token })).status, 409);
  s.locked = false;
  const r = await post('commit', { token: draft.token, target: i.source, position: [0, 0, 0] });
  assert.equal(r.status, 200);
  const b = await r.json(); assert.equal(b.placement.offset, i.target); assert.deepEqual(b.placement.position, i.position);
  assert.equal(b.rebuild_scene, true); assert.equal(s.edits.length, 1);
});

test('reset restores exact bytes across transforms and replacements, preserves redo and detaches old artefacts', t => {
  const s = fixture(t), original = Buffer.from(s.buffer), i = intent(s);
  applyEdit(s, {kind:'transform', target:i.source, position:[8,9,10]});
  const draft = prepareDrop(s, i); commitDrop(s, {token:draft.token});
  const changed = Buffer.from(s.buffer);
  applyEdit(s, {kind:'transform', target:i.source, heading:40});
  const future = Buffer.from(s.buffer); undo(s);
  s.lastSave = {file:'existing-save.decoded'}; s.lastPatch = {dir:'existing-patch'};
  const stale = prepareDrop(s, i);
  const result = resetScene(s);
  assert.equal(result.reset_count, 2); assert.equal(result.rebuild_scene, true);
  assert.deepEqual(s.buffer, original); assert.deepEqual(fs.readFileSync(s.file), original);
  assert.equal(s.edits.length, 0); assert.equal(s.undone.length, 3); assert.equal(s.dirty, false);
  assert.equal(s.lastSave, null); assert.equal(s.lastPatch, null);
  assert.throws(()=>commitDrop(s, {token:stale.token}), /STALE_PLAN/);
  redo(s); redo(s); assert.deepEqual(s.buffer, changed);
  redo(s); assert.deepEqual(s.buffer, future);
});

test('reset HTTP is locked during gameplay and repeated reset keeps the redo chain', async t => {
  const s=fixture(t), server=await startServer({session:s,port:0}); t.after(()=>server.close());
  const reset=()=>fetch(server.url+'/api/reset',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  applyEdit(s,{kind:'transform',target:s.placements[0].offset,position:[8,9,10]});
  const changed=Buffer.from(s.buffer);
  for(const key of ['locked','lastLaunch']) {
    s[key]=key==='locked'?true:{running:true};
    assert.equal((await reset()).status,409); assert.deepEqual(s.buffer,changed);
    s[key]=key==='locked'?false:null;
  }
  const r=await (await reset()).json();
  assert.equal(r.reset_scene,true); assert.equal(r.undo_depth,0);assert.equal(r.redo_depth,1);
  const again=await (await reset()).json();assert.equal(again.reset_count,0);assert.equal(again.redo_depth,1);
});
