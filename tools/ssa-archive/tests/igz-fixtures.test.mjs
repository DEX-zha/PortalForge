// Fixture tests on the decoded tutorial level.bld (game data, not committed); skipped when absent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph, validateGraph } from '../src/igz/graph.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const level = path.resolve(here, '../../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded');
const SKIP = { skip: fs.existsSync(level) ? false : 'decoded tutorial level.bld not present (run: node cli.mjs extract <Level_027_Tutorial.bld> --out .local/workspaces/tutorial-bld --decode)' };

test('tutorial level.bld: 9 sections to EOF, 224 types, accounting == total, spawn record typed with its position', SKIP, () => {
  const buf = fs.readFileSync(level);
  const g = buildGraph(buf, { file: level, fields: false });
  assert.equal(g.sections.length, 9);
  assert.equal(g.sections[8].offset + g.sections[8].size, buf.length);
  assert.ok(g.types.length >= 220 && g.types.length <= 232, `types ${g.types.length}`);   // NUL-split numbering incl. block records
  assert.equal(g.types[13].name, 'tfbActorInfo');
  assert.equal(g.types[123].name, 'tfbPhysicsModel');
  assert.ok(g.objects.length > 20000);
  assert.equal(g.accounting.objects + g.accounting.unparsed + g.accounting.padding, g.accounting.total);
  assert.equal(validateGraph(g).valid, true);
  const spawn = g.objects.find(o => o.offset === 0x1a76ec);
  assert.equal(spawn.type_name, 'tfbPhysicsModel');
  assert.ok(Math.abs(buf.readFloatBE(0x1a76ec + 0x94) - 91.73) < 0.01);
});
