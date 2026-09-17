import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildArchive } from './helpers/synthetic.mjs';
import { buildEditorPatch } from '../src/editor/patch-build.mjs';
import { parseArchive } from '../src/iga/reader.mjs';

test('editor patch replaces an entry inside an IGA archive, not the entire archive with decoded IGZ', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-patch-'));
  const old = Buffer.from('IGZ original entry'),
    edited = Buffer.from('IGZ modified entry');
  const original = path.join(dir, 'source.bld'),
    file = path.join(dir, 'edited.decoded');
  fs.writeFileSync(original, buildArchive([{ name: 'level.bld', data: old }]).buf);
  fs.writeFileSync(file, edited);
  const game = path.join(dir, 'test.wbfs');
  fs.writeFileSync(game, 'synthetic game path');
  const r = buildEditorPatch({
    experimentId: 'test-editor',
    session: { entry: 0, archive: 'level/Test.bld' },
    replacements: [{ disc_path: 'level/Test.bld', file }],
    original,
    game,
    outDir: path.join(dir, 'patch'),
  });
  const archive = fs.readFileSync(path.join(r.dir, r.replacements[0].file));
  assert.equal(archive.readUInt32LE(0), 0x1a414749);
  const parsed = parseArchive(archive),
    e = parsed.entries[0];
  assert.deepEqual(archive.subarray(e.start, e.start + e.size), edited);
  assert.ok(r.entry_verified);
  assert.notEqual(r.expected_monitor_sizes['level/Test.bld'], r.original_monitor_size);
  assert.ok(fs.existsSync(r.descriptor));
  assert.match(fs.readFileSync(r.xml, 'utf8'), /external="\/files\/level\/Test.bld"/);
});
