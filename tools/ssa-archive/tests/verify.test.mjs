import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildArchive, sampleEntries, corrupted } from './helpers/synthetic.mjs';
import { verifyBuffer, verifyWorkspace } from '../src/iga/verify.mjs';
import { extractToWorkspace } from '../src/workspace/manifest.mjs';

const REASONS = [
  'BAD_MAGIC',
  'UNSUPPORTED_VERSION',
  'COUNT_MISMATCH',
  'HASHES_NOT_SORTED',
  'MISALIGNED_ENTRY',
  'ENTRY_OVERLAP',
  'ENTRY_OUT_OF_BOUNDS',
  'NAME_TABLE_BOUNDS',
  'NAME_OFFSET_OUT_OF_RANGE',
  'UNSUPPORTED_MODE',
  'CHUNK_TABLE_OUT_OF_RANGE',
  'LOOKUP_WORDS_MISMATCH',
];

test('a valid synthetic archive is VALID with no failures', () => {
  const r = verifyBuffer(buildArchive(sampleEntries(5)).buf);
  assert.equal(r.status, 'VALID');
  assert.deepEqual(r.failures, []);
});

for (const reason of REASONS) {
  test(`corruption ${reason} is reported with offset, actual and expected`, () => {
    const r = verifyBuffer(corrupted(reason));
    assert.notEqual(r.status, 'VALID');
    const f = r.failures.find(x => x.reason === reason);
    assert.ok(f, `expected ${reason}, got ${JSON.stringify(r.failures.map(x => x.reason))}`);
    assert.equal(typeof f.offset, 'number');
    assert.notEqual(f.actual, undefined);
    assert.notEqual(f.expected, undefined);
    assert.ok(f.field.length > 0);
  });
}

test('unsupported version yields status UNSUPPORTED, structural faults yield INVALID', () => {
  assert.equal(verifyBuffer(corrupted('UNSUPPORTED_VERSION')).status, 'UNSUPPORTED');
  assert.equal(verifyBuffer(corrupted('MISALIGNED_ENTRY')).status, 'INVALID');
});

test('workspace verification detects a tampered entry file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-ws-'));
  const { buf } = buildArchive(sampleEntries(3));
  const manifest = extractToWorkspace(buf, {
    discPath: 'test/x.arc',
    sourceFile: path.join(dir, 'x.arc'),
    outDir: dir,
  });
  assert.equal(verifyWorkspace(dir).status, 'VALID');
  const victim = path.join(dir, manifest.entries[1].file);
  const data = fs.readFileSync(victim);
  data[0] ^= 0xff;
  fs.writeFileSync(victim, data);
  const r = verifyWorkspace(dir);
  assert.equal(r.status, 'INVALID');
  assert.equal(r.failures[0].reason, 'WORKSPACE_ENTRY_HASH_MISMATCH');
  assert.equal(r.failures[0].field, 'entries[1].data_sha256');
});
