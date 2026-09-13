import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syntheticLevel } from './helpers/synthetic-level.mjs';
import { openSession } from '../src/editor/session.mjs';
import { startServer } from '../src/editor/server.mjs';
import { schemaValidator, contracts002 } from '../src/workspace/manifest.mjs';

// Feature 003 T011. The read endpoints of contracts/editor-api.md. What matters here is not that they answer but
// that what they answer is the frozen record, evidence included: a view cannot render evidence it never receives.

function serve() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-api-'));
  const file = path.join(dir, 'level.bld.decoded');
  fs.writeFileSync(file, syntheticLevel().buf);
  const session = openSession(file, { archive: 'level/Test.bld', entry: 3, deps: { gates: () => ({ status: 'PASS' }) } });
  return startServer({ session, port: 0 });
}

test('GET /api/session describes the session and what was detected, without the bytes', async () => {
  const s = await serve();
  try {
    const r = await fetch(`${s.url}/api/session`);
    assert.equal(r.status, 200);
    const b = await r.json();
    assert.match(b.id, /^s_/);
    assert.equal(b.archive, 'level/Test.bld');
    assert.equal(b.entry, 3);
    assert.equal(b.placement_count, 4);
    assert.equal(b.has_runtime_map, false);
    assert.equal(b.detection.placement_type, 77);
    assert.equal(b.counts.direct, 3);
    assert.equal(b.counts.absent, 1);
    assert.equal(b.dirty, false);
    assert.equal(b.locked, false);
    assert.equal(b.buffer, undefined, 'the bytes never leave the editor process');
    assert.equal(b.placements, undefined, 'the summary does not carry the records');
  } finally { await s.close(); }
});

test('GET /api/placements returns records that validate against the frozen contract, with their layers', async () => {
  const s = await serve();
  try {
    const b = await (await fetch(`${s.url}/api/placements`)).json();
    assert.equal(b.placements.length, 4);
    const validate = schemaValidator('placement-v1.schema.json', contracts002);
    for (const p of b.placements) assert.ok(validate(p), `0x${p.offset.toString(16)}: ${JSON.stringify(validate.errors)}`);
    for (const p of b.placements) {
      assert.equal(p.model_version, 1);
      assert.equal(typeof p.evidence.model, 'string');
      assert.equal(typeof p.evidence.layers, 'string');
    }
    const props = b.layers.find(l => l.name === 'Props');
    assert.equal(props.count, 3);
    assert.equal(typeof props.grades, 'object');
    assert.ok(Object.values(props.grades).some(n => n > 0), 'every placement of a layer is graded');
  } finally { await s.close(); }
});

test('GET /api/placement/:offset adds the safety rules and the duplication targets', async () => {
  const s = await serve();
  try {
    const all = await (await fetch(`${s.url}/api/placements`)).json();
    const first = all.placements[0];
    const b = await (await fetch(`${s.url}/api/placement/${first.offset}`)).json();
    assert.equal(b.placement.offset, first.offset);
    assert.ok(Array.isArray(b.safety));
    assert.ok(b.safety.every(r => r.id && r.severity && r.message), 'a rule states what it is and how bad it is');
    assert.ok(b.safety.some(r => r.id === 'NO_RUNTIME_MAP'), 'a level without a runtime map says so on every object');
    assert.ok(Array.isArray(b.replace_targets));
    assert.ok(b.replace_targets.every(t => t.span === first.span), 'only same-size slots are offered');
    assert.ok(b.replace_targets.every(t => t.offset !== first.offset), 'and never the source itself');
    const hex = await (await fetch(`${s.url}/api/placement/0x${first.offset.toString(16)}`)).json();
    assert.equal(hex.placement.offset, first.offset, 'an offset may be given in hexadecimal, as every other tool prints it');
  } finally { await s.close(); }
});

test('GET /api/placement/:offset on an unknown offset is a named 404, not an empty record', async () => {
  const s = await serve();
  try {
    const r = await fetch(`${s.url}/api/placement/999999`);
    assert.equal(r.status, 404);
    assert.equal((await r.json()).error, 'NO_SUCH_PLACEMENT');
  } finally { await s.close(); }
});
