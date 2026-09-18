import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadAdditionEvidence } from '../src/editor/addition-evidence.mjs';
import { startServer } from '../src/editor/server.mjs';
import { openSession } from '../src/editor/session.mjs';
import { syntheticLevel } from './helpers/synthetic-level.mjs';

const key = 'a'.repeat(64);
const run = 'editor-direct-test-12345678-abcdef12';
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-evidence-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const reports = path.join(dir, 'reports'),
    evidence = path.join(dir, 'evidence');
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  };
  write(path.join(reports, key + '.json'), { family: key, name: 'Source', runtime: 'passed', launches: [{ run }] });
  return { dir, reports, evidence, write };
}

test('family evidence resolves ordinary launches, legacy batches and missing records without inventing results', t => {
  const f = fixture(t);
  const batch = 'batch-12345678-abcd1234';
  f.write(path.join(f.reports, key + '.json'), {
    family: key,
    batch,
    launches: [{ run }, { run }, { run: '../outside' }],
  });
  f.write(path.join(f.reports, batch, 'result.json'), {
    runs: [{ status: 'completed', screenshots: ['tutorial.png'] }],
  });
  f.write(path.join(f.evidence, 'editor-runs', run + '.json'), {
    id: run,
    status: 'MACRO_COMPLETED',
    screenshots: ['redirect-arrived.png'],
  });
  const loaded = loadAdditionEvidence(key, f);
  assert.equal(loaded.record.runs.length, 2);
  assert.equal(loaded.record.runs[1].id, run);
  assert.deepEqual(loaded.record.missing, ['unavailable launch record']);
  assert.equal(loadAdditionEvidence('../outside', f), null);
  fs.writeFileSync(path.join(f.evidence, 'editor-runs', run + '.json'), '{broken');
  assert.ok(loadAdditionEvidence(key, f).record.missing.includes(run));
});

test('ordinary launch report links serve redirect captures and refuse files outside evidence', async t => {
  const f = fixture(t);
  const image = path.join(f.evidence, 'run-redirect-arrived.png');
  const outside = path.join(f.dir, 'private.png');
  fs.mkdirSync(f.evidence, { recursive: true });
  fs.writeFileSync(image, 'synthetic capture bytes');
  fs.writeFileSync(outside, 'private');
  f.write(path.join(f.evidence, 'editor-runs', run + '.json'), {
    id: run,
    status: 'MACRO_COMPLETED',
    screenshots: [image, outside],
  });
  const file = path.join(f.dir, 'level.decoded');
  fs.writeFileSync(file, syntheticLevel().buf);
  const session = openSession(file, {
    archive: 'level/Test.bld',
    entry: 3,
    deps: { gates: () => ({ status: 'PASS' }) },
  });
  const server = await startServer({ session, port: 0, deps: { reportsDir: f.reports, evidenceDir: f.evidence } });
  try {
    const page = await fetch(server.url + '/addition-report/' + key);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /run-redirect-arrived/);
    assert.ok(html.includes(run));
    const shot = await fetch(`${server.url}/api/addition-report/${key}/shot/0/0`);
    assert.equal(shot.status, 200);
    assert.equal(await shot.text(), 'synthetic capture bytes');
    assert.equal((await fetch(`${server.url}/api/addition-report/${key}/shot/0/1`)).status, 404);
    fs.unlinkSync(image);
    assert.equal((await fetch(`${server.url}/api/addition-report/${key}/shot/0/0`)).status, 404);
  } finally {
    await server.close();
  }
});
