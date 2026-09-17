import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  save,
  load,
  list,
  validate,
  promote,
  contradict,
  editableFindings,
  render,
} from '../src/research/findings.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-findings-'));
const base = (over = {}) => ({
  id: 'level.entity.transform.x',
  category: 'world-entities',
  structure: 'entity transform X',
  location: { file_pattern: 'level/*.bld:level.bld', offset: 0x1234, length: 4 },
  type: 'f32',
  endian: 'be',
  meaning: 'X coordinate of an entity',
  evidence: [],
  confidence: 'UNKNOWN',
  editable: false,
  updated: '2026-09-12',
  ...over,
});

test('schema forbids editable findings below CONFIRMED and requires evidence for LIKELY/CONFIRMED', () => {
  assert.equal(validate(base()).valid, true);
  assert.equal(validate(base({ editable: true })).valid, false);
  assert.equal(validate(base({ confidence: 'LIKELY' })).valid, false);
  assert.equal(
    validate(base({ confidence: 'LIKELY', evidence: [{ probe: 'scan', summary: 'triple in range' }] })).valid,
    true,
  );
  assert.equal(validate(base({ endian: 'middle' })).valid, false);
  assert.equal(validate(base({ category: 'unicorns' })).valid, false);
});

test('UNKNOWN -> LIKELY needs two independent observations; CONFIRMED needs a PASS experiment referencing the finding', () => {
  const dir = tmp();
  const experiments = path.join(dir, 'exp');
  fs.mkdirSync(experiments);
  const opts = { dir, experiments };
  save(base(), opts);
  assert.throws(
    () =>
      promote('level.entity.transform.x', {
        to: 'LIKELY',
        evidence: { probe: 'scan-floats', summary: 'plausible XYZ triple' },
        opts,
      }),
    /two independent/,
  );
  const r = promote('level.entity.transform.x', {
    to: 'LIKELY',
    evidence: { probe: 'live-memory', summary: 'write moved the object' },
    opts,
  });
  assert.equal(r.confidence, 'LIKELY');
  assert.equal(r.evidence.length, 2);
  assert.throws(
    () => promote('level.entity.transform.x', { to: 'CONFIRMED', evidence: { probe: 'x', summary: 'y' }, opts }),
    /experiment_id/,
  );
  fs.writeFileSync(
    path.join(experiments, 'm2-001.json'),
    JSON.stringify({ id: 'm2-001', status: 'FAIL', inputs: { mutation: { finding_id: 'level.entity.transform.x' } } }),
  );
  assert.throws(
    () =>
      promote('level.entity.transform.x', {
        to: 'CONFIRMED',
        evidence: { experiment_id: 'm2-001', summary: 'moved +100 on X twice' },
        opts,
      }),
    /FAIL, not PASS/,
  );
  fs.writeFileSync(
    path.join(experiments, 'm2-002.json'),
    JSON.stringify({ id: 'm2-002', status: 'PASS', inputs: { mutation: { finding_id: 'level.entity.transform.x' } } }),
  );
  const c = promote('level.entity.transform.x', {
    to: 'CONFIRMED',
    evidence: { experiment_id: 'm2-002', summary: 'moved +100 on X twice' },
    opts,
  });
  assert.equal(c.confidence, 'CONFIRMED');
  c.editable = true;
  save(c, opts);
  assert.equal(editableFindings(opts).length, 1);
  const k = contradict('level.entity.transform.x', {
    evidence: { experiment_id: 'm2-003', summary: 'no movement with same input' },
    opts,
  });
  assert.equal(k.confidence, 'UNKNOWN');
  assert.equal(k.editable, false);
  assert.match(k.evidence.at(-1).summary, /^CONTRADICTION/);
  assert.equal(editableFindings(opts).length, 0);
});

test('render writes one Markdown table per category with the confidence label', () => {
  const dir = tmp();
  const outDir = path.join(dir, 'docs');
  save(
    base({
      id: 'iga-v4.header.magic',
      category: 'container',
      structure: 'magic',
      confidence: 'CONFIRMED',
      evidence: [{ probe: 'parser', summary: 'all samples' }],
    }),
    { dir },
  );
  save(base(), { dir });
  const files = render({ dir, outDir });
  assert.deepEqual(files.map(f => path.basename(f)).sort(), ['container.md', 'world-entities.md']);
  const md = fs.readFileSync(path.join(outDir, 'container.md'), 'utf8');
  assert.match(md, /\*\*CONFIRMED\*\*/);
  assert.match(md, /iga-v4\.header\.magic/);
  assert.equal(list({ dir }).length, 2);
  assert.equal(load('iga-v4.header.magic', { dir }).confidence, 'CONFIRMED');
});

test('render refreshes the format document beside its relocated introduction', () => {
  const dir = tmp();
  const outDir = path.join(dir, 'docs', 'findings');
  const formatDir = path.join(dir, 'docs', 'format');
  fs.mkdirSync(formatDir, { recursive: true });
  fs.writeFileSync(path.join(formatDir, 'iga-v4.intro.md'), '# Format introduction\n\nCurrent gate scope.\n');
  fs.writeFileSync(path.join(formatDir, 'iga-v4.md'), 'stale generated content');
  save(base({ id: 'iga.header.test', category: 'container' }), { dir });
  const files = render({ dir, outDir });
  const target = path.join(formatDir, 'iga-v4.md');
  assert.ok(files.includes(target));
  const rendered = fs.readFileSync(target, 'utf8');
  assert.match(rendered, /^# Format introduction/);
  assert.match(rendered, /Current gate scope/);
  assert.match(rendered, /iga\.header\.test/);
  assert.ok(!rendered.includes('stale generated content'));
  assert.ok(!fs.existsSync(path.join(dir, 'docs', 'iga-v4.md')));
});
