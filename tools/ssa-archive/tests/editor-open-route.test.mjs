import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syntheticLevel } from './helpers/synthetic-level.mjs';
import { openSession } from '../src/editor/session.mjs';
import { startServer } from '../src/editor/server.mjs';
import { capabilitiesOf } from '../src/editor/level-catalog.mjs';

// Feature 006 T008. One server, several levels: `GET /api/levels` says where the session stands and what the
// level can do, `POST /api/open` replaces the session. The refusals are the point: a switch that silently
// dropped edits, or happened under a running Dolphin, would be worse than no switch at all.

const gates = { gates: () => ({ status: 'PASS' }) };

function machine({ switching = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-open-route-'));
  const files = {
    'level/A.bld': path.join(dir, 'a.decoded'),
    'level/B.bld': path.join(dir, 'b.decoded'),
  };
  fs.writeFileSync(files['level/A.bld'], syntheticLevel({ placementType: 77 }).buf);
  fs.writeFileSync(files['level/B.bld'], syntheticLevel({ placementType: 66 }).buf);
  const open = async query => {
    const file = files[query];
    if (!file) throw Object.assign(new Error(`no level named ${query}`), { error: 'NO_SUCH_LEVEL' });
    const s = openSession(file, { archive: query, entry: 3, deps: gates });
    s.level = { name: query.slice(6, 7), family: 'story', tutorial: false, capabilities: capabilitiesOf({}) };
    return s;
  };
  const levels = async () => ({
    levels: Object.keys(files).map(archive => ({
      archive,
      key: archive.toLowerCase(),
      name: archive.slice(6, 7),
      family: 'story',
      ready: true,
      capabilities: capabilitiesOf({}),
    })),
  });
  return open('level/A.bld').then(async session => ({
    session,
    server: await startServer({ session, port: 0, deps: switching ? { open, levels } : {} }),
  }));
}

const get = (s, p) => fetch(`${s.url}${p}`).then(r => r.json());
const post = (s, p, body = {}) =>
  fetch(`${s.url}${p}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async r => ({ status: r.status, body: await r.json() }));

test('/api/levels lists the levels, marks the current one and states its capabilities', async () => {
  const { server } = await machine();
  try {
    const r = await get(server, '/api/levels');
    assert.equal(r.switching, true);
    assert.deepEqual(
      r.levels.map(l => [l.name, l.current]),
      [
        ['A', true],
        ['B', false],
      ],
    );
    assert.equal(r.current.archive, 'level/A.bld');
    assert.equal(r.current.capabilities.transform.available, true);
    assert.equal(r.current.capabilities.duplicate.available, false);
    assert.match(r.current.capabilities.duplicate.why, /runtime map/);
  } finally {
    await server.close();
  }
});

test('/api/open replaces the session: every later route answers for the new level', async () => {
  const { server } = await machine();
  try {
    const before = await get(server, '/api/session');
    const r = await post(server, '/api/open', { archive: 'level/B.bld' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.opened.archive, 'level/B.bld');
    const after = await get(server, '/api/session');
    assert.notEqual(after.id, before.id);
    assert.equal(after.archive, 'level/B.bld');
    assert.equal(after.detection.placement_type, 66, 'the new level is detected on its own bytes');
    assert.equal(after.level.name, 'B');
    const levels = await get(server, '/api/levels');
    assert.deepEqual(
      levels.levels.map(l => l.current),
      [false, true],
    );
    const placements = await get(server, '/api/placements');
    assert.equal(placements.placements.length, 4);
  } finally {
    await server.close();
  }
});

test('/api/open refuses to drop unsaved edits unless told to, and then really drops them', async () => {
  const { server } = await machine();
  try {
    const placements = await get(server, '/api/placements');
    const edit = await post(server, '/api/edit', {
      kind: 'transform',
      target: placements.placements[0].offset,
      heading: 45,
    });
    assert.equal(edit.status, 200);
    const refused = await post(server, '/api/open', { archive: 'level/B.bld' });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, 'UNSAVED_CHANGES');
    assert.equal(refused.body.undo_depth, 1);
    assert.equal((await get(server, '/api/session')).archive, 'level/A.bld', 'nothing changed');

    const forced = await post(server, '/api/open', { archive: 'level/B.bld', discard: true });
    assert.equal(forced.status, 200);
    const s = await get(server, '/api/session');
    assert.equal(s.archive, 'level/B.bld');
    assert.equal(s.dirty, false);
    assert.equal(s.undo_depth, 0);
  } finally {
    await server.close();
  }
});

test('/api/open refuses while the session is locked, an unknown level, and an unnamed one', async () => {
  const { server, session } = await machine();
  try {
    const unknown = await post(server, '/api/open', { archive: 'level/C.bld' });
    assert.equal(unknown.status, 409);
    assert.equal(unknown.body.error, 'NO_SUCH_LEVEL');
    const unnamed = await post(server, '/api/open', {});
    assert.equal(unnamed.status, 409);
    assert.equal(unnamed.body.error, 'BAD_VALUE');
    session.locked = true;
    const locked = await post(server, '/api/open', { archive: 'level/B.bld' });
    assert.equal(locked.status, 409);
    assert.equal(locked.body.error, 'SESSION_LOCKED');
    session.locked = false;
    assert.equal((await get(server, '/api/session')).archive, 'level/A.bld');
  } finally {
    await server.close();
  }
});

test('a server started on one file cannot switch, and says so; its capabilities are still derived', async () => {
  const { server } = await machine({ switching: false });
  try {
    const levels = await get(server, '/api/levels');
    assert.equal(levels.switching, false);
    assert.deepEqual(levels.levels, []);
    assert.equal(levels.current.capabilities.transform.available, true);
    const r = await post(server, '/api/open', { archive: 'level/B.bld' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'OPEN_UNAVAILABLE');
  } finally {
    await server.close();
  }
});
