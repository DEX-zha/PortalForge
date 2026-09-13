import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syntheticLevel } from './helpers/synthetic-level.mjs';
import { openSession } from '../src/editor/session.mjs';
import { startServer } from '../src/editor/server.mjs';

// Feature 003 T005. The view is served from exactly two directories and nothing else is reachable, because a
// local server that will read any path is a file browser for the whole machine.

function serve() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-server-'));
  const file = path.join(dir, 'level.bld.decoded');
  fs.writeFileSync(file, syntheticLevel().buf);
  const session = openSession(file, { archive: 'level/Test.bld', entry: 3, deps: { gates: () => ({ status: 'PASS' }) } });
  return startServer({ session, port: 0, host: '127.0.0.1' });
}

test('server: binds the loopback interface only and serves the view from two directories', async () => {
  const s = await serve();
  try {
    assert.equal(s.address.address, '127.0.0.1', 'never bound to a routable interface');
    const root = await fetch(`${s.url}/`);
    assert.equal(root.status, 200);
    assert.match(root.headers.get('content-type') ?? '', /text\/html/);
    assert.match(await root.text(), /<!doctype html|<!-- 3D placement editor view/i);

    const mod = await fetch(`${s.url}/view/select.mjs`);
    assert.equal(mod.status, 200);
    assert.match(mod.headers.get('content-type') ?? '', /javascript/);

    const three = await fetch(`${s.url}/vendor/three/build/three.module.js`);
    assert.equal(three.status, 200, 'three is served from node_modules, never from a network');
    assert.match(mod.headers.get('content-type') ?? '', /javascript/);
  } finally { await s.close(); }
});

test('server: refuses every path outside the view and the vendored library', async () => {
  const s = await serve();
  try {
    for (const p of ['/package.json', '/src/editor/session.mjs', '/view/../../package.json',
      '/view/..%2f..%2fpackage.json', '/vendor/three/../../../package.json', '/etc/passwd', '/view/']) {
      const r = await fetch(`${s.url}${p}`);
      assert.equal(r.status, 404, `${p} must not be served`);
    }
  } finally { await s.close(); }
});

test('server: an unknown API route is a 404 with a JSON body, not an HTML page', async () => {
  const s = await serve();
  try {
    const r = await fetch(`${s.url}/api/nope`);
    assert.equal(r.status, 404);
    assert.match(r.headers.get('content-type') ?? '', /application\/json/);
    const body = await r.json();
    assert.equal(typeof body.error, 'string');
  } finally { await s.close(); }
});
