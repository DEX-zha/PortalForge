// Fixture tests against locally extracted original archives. They contain game data and are not
// committed; every test here skips with an explicit message when .local/samples is absent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArchive } from '../src/iga/reader.mjs';
import { verifyBuffer } from '../src/iga/verify.mjs';
import { extractToWorkspace } from '../src/workspace/manifest.mjs';
import { rebuildFromWorkspace } from '../src/iga/writer.mjs';
import { diffArchives } from '../src/iga/diff.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const samples = path.resolve(here, '../../../.local/samples/DATA/files');
const sample = rel => path.join(samples, ...rel.split('/'));
const present = rel => fs.existsSync(sample(rel));
const SKIP = rel => ({ skip: present(rel) ? false : `fixture ${rel} not extracted under .local/samples (run: node cli.mjs disc-extract --path ${rel})` });

test('Level_027_Tutorial.arc matches the CONFIRMED R2 findings', SKIP('level/Level_027_Tutorial.arc'), () => {
  const buf = fs.readFileSync(sample('level/Level_027_Tutorial.arc'));
  const p = parseArchive(buf);
  assert.deepEqual(p.issues, []);
  assert.equal(p.header.count, 477);
  assert.ok(p.entries.every(e => e.mode === 0xFFFFFFFF));
  for (let i = 1; i < p.hashes.length; i++) assert.ok(p.hashes[i - 1] < p.hashes[i]);
  assert.ok(p.entries.every(e => e.start % 0x800 === 0));
  assert.equal(p.header.name_table_offset + p.header.name_table_size, buf.length);
  assert.equal(p.header.table_size, 16 * 477);
  assert.equal(verifyBuffer(buf).status, 'VALID');
});

for (const rel of ['level/Level_027_Tutorial.arc', 'level/Level_027_Tutorial.bld', 'character/001_Gryphon.bld']) {
  test(`byte-identical round-trip of ${rel}`, SKIP(rel), () => {
    const buf = fs.readFileSync(sample(rel));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-fx-'));
    extractToWorkspace(buf, { discPath: rel, sourceFile: sample(rel), outDir: dir });
    const r = rebuildFromWorkspace(dir);
    const d = diffArchives(buf, r.buffer);
    assert.equal(d.unclassified_bytes, 0);
    assert.deepEqual(d.regions, [], `differences: ${JSON.stringify(d.regions.slice(0, 5))}`);
    assert.equal(Buffer.compare(r.buffer, buf), 0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
}
