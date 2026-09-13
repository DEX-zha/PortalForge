import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syntheticLevel } from './helpers/synthetic-level.mjs';
import { openSession } from '../src/editor/session.mjs';
import { startServer } from '../src/editor/server.mjs';

// Feature 003 T029. The editing routes of the contract. The view sends intents and never bytes, so these are the
// only way a change reaches the session, and a refusal must arrive as a named error rather than a stack trace.

async function serve(deps = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-apiedit-'));
  const file = path.join(dir, 'level.bld.decoded');
  fs.writeFileSync(file, syntheticLevel().buf);
  const session = openSession(file, { archive: 'level/Test.bld', entry: 3, deps: { gates: () => ({ status: 'PASS' }) } });
  const s = await startServer({ session, port: 0, deps });
  return { ...s, session, dir };
}
const post = (s, p, body) => fetch(`${s.url}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });

test('POST /api/edit applies a transform and reports the new record, the rules and the history depth', async () => {
  const s = await serve();
  try {
    const target = s.session.placements[0].offset;
    const r = await post(s, '/api/edit', { kind: 'transform', target, position: [7, 8, 9], heading: 33 });
    assert.equal(r.status, 200);
    const b = await r.json();
    assert.deepEqual(b.placement.position, [7, 8, 9]);
    assert.equal(b.placement.rotation.heading, 33);
    assert.equal(b.dirty, true);
    assert.equal(b.undo_depth, 1);
    assert.ok(Array.isArray(b.safety));
    assert.equal(fs.readFileSync(s.session.file).length, s.session.buffer.length, 'the file is untouched');
  } finally { await s.close(); }
});

test('POST /api/undo and /api/redo walk the history and refuse politely at the ends', async () => {
  const s = await serve();
  try {
    const target = s.session.placements[0].offset;
    const start = [...s.session.placements[0].position];
    await post(s, '/api/edit', { kind: 'transform', target, position: [1, 1, 1] });
    const u = await (await post(s, '/api/undo')).json();
    assert.deepEqual(u.placement.position, start);
    assert.equal(u.dirty, false);
    const again = await post(s, '/api/undo');
    assert.equal(again.status, 409);
    assert.equal((await again.json()).error, 'NOTHING_TO_UNDO');
    const r = await (await post(s, '/api/redo')).json();
    assert.deepEqual(r.placement.position, [1, 1, 1]);
    assert.equal((await (await post(s, '/api/redo')).json()).error, 'NOTHING_TO_REDO');
  } finally { await s.close(); }
});

test('POST /api/edit refuses a bad intent with the named error, not a stack trace', async () => {
  const s = await serve();
  try {
    const target = s.session.placements[0].offset;
    for (const [body, error] of [
      [{ kind: 'transform', target: 0x999999, position: [0, 0, 0] }, 'NO_SUCH_PLACEMENT'],
      [{ kind: 'transform', target }, 'NOTHING_TO_CHANGE'],
      [{ kind: 'transform', target, position: [1, 2] }, 'BAD_VALUE'],
      [{ kind: 'transform', target, model: 'x' }, 'UNSUPPORTED_FIELD'],
      [{ kind: 'replace', target }, 'UNSUPPORTED_INTENT'],
    ]) {
      const r = await post(s, '/api/edit', body);
      assert.equal(r.status, 409, JSON.stringify(body));
      const j = await r.json();
      assert.equal(j.error, error);
      assert.ok(j.reason.length > 10, 'the refusal explains itself');
    }
    const bad = await fetch(`${s.url}/api/edit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json' });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error, 'BAD_BODY');
  } finally { await s.close(); }
});

test('POST /api/save writes only after a valid plan, and /api/patch refuses until it has one', async () => {
  let built = 0;
  const s = await serve({ build: () => { built++; return { dir: 'patch-dir', replacements: [] }; } });
  try {
    const noPatch = await post(s, '/api/patch');
    assert.equal(noPatch.status, 409);
    assert.equal((await noPatch.json()).error, 'NOTHING_SAVED');
    assert.equal(built, 0);

    const out = path.join(s.dir, 'edited.decoded');
    const empty = await post(s, '/api/save', { out });
    assert.equal(empty.status, 409, 'saving with no edit is refused');
    assert.equal(fs.existsSync(out), false);

    await post(s, '/api/edit', { kind: 'transform', target: s.session.placements[0].offset, heading: 77 });
    const saved = await (await post(s, '/api/save', { out })).json();
    assert.equal(saved.plan.status, 'VALID');
    assert.equal(saved.written, out);
    assert.equal(saved.dirty, false);
    assert.ok(fs.existsSync(out));

    const patched = await (await post(s, '/api/patch')).json();
    assert.equal(built, 1);
    assert.equal(patched.patch.dir, 'patch-dir');
  } finally { await s.close(); }
});

test('POST /api/launch refuses without a prediction and takes the lock, /api/observe releases it', async () => {
  const s = await serve({ build: () => ({ dir: 'patch-dir', replacements: [] }), run: async () => ({ id: 'exp_x' }) });
  try {
    const out = path.join(s.dir, 'edited.decoded');
    await post(s, '/api/edit', { kind: 'transform', target: s.session.placements[0].offset, heading: 77 });
    await post(s, '/api/save', { out });
    await post(s, '/api/patch');

    const noPred = await post(s, '/api/launch', { prediction: '  ' });
    assert.equal(noPred.status, 409);
    assert.equal((await noPred.json()).error, 'PREDICTION_REQUIRED');
    assert.equal((await (await fetch(`${s.url}/api/session`)).json()).locked, false);

    const l = await (await post(s, '/api/launch', { prediction: 'the crate turns 77 degrees' })).json();
    assert.equal(l.launch.experiment_id, 'exp_x');
    assert.equal(l.locked, true);
    const blocked = await post(s, '/api/patch');
    assert.equal((await blocked.json()).error, 'SESSION_LOCKED');

    const o = await (await post(s, '/api/observe', { experiment_id: 'exp_x', observed: 'it turned', matched: true })).json();
    assert.equal(o.launch.observed, 'it turned');
    assert.equal(o.locked, false);
  } finally { await s.close(); }
});
