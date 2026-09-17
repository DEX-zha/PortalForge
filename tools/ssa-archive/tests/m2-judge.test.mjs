import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { judge } from '../src/experiments/m2-mutation.mjs';

const run = () => ({
  pid: 1,
  started: 's',
  finished: 'f',
  monitor_lines: [],
  screenshots: [],
  crash_or_load_error: false,
  observed_effect: '',
});
const record = (id, runs) => ({
  id,
  kind: 'M2_MUTATION',
  started: 's',
  finished: 'f',
  inputs: {
    game: 'g',
    archive_disc_path: 'a',
    original_sha256: 'x',
    rebuilt_sha256: 'y',
    patch_dir: 'p',
    descriptor: 'd',
    mutation: { entry_index: 3, offset: 1, type: 'f32be', old_hex: '00', new_hex: '01', predicted_effect: 'moves' },
  },
  control: run(),
  runs,
  status: 'UNKNOWN',
});

test('M2 PASS requires every run to match and at least two repeats (FR-012, SC-004)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-judge-'));
  fs.writeFileSync(path.join(dir, 'one.json'), JSON.stringify(record('one', [run()])));
  fs.writeFileSync(path.join(dir, 'two.json'), JSON.stringify(record('two', [run(), run()])));
  fs.writeFileSync(path.join(dir, 'mixed.json'), JSON.stringify(record('mixed', [run(), run()])));
  assert.equal(judge({ id: 'one', run: 1, observed: 'moved', match: true, dir }).status, 'UNKNOWN');
  assert.equal(judge({ id: 'two', run: 1, observed: 'moved', match: true, dir }).status, 'UNKNOWN');
  assert.equal(judge({ id: 'two', run: 2, observed: 'moved again', match: true, dir }).status, 'PASS');
  judge({ id: 'mixed', run: 1, observed: 'moved', match: true, dir });
  const m = judge({ id: 'mixed', run: 2, observed: 'did not move', match: false, dir });
  assert.equal(m.status, 'FAIL');
  assert.equal(m.failing_stage, 'observation');
  assert.throws(() => judge({ id: 'two', run: 3, observed: 'x', match: true, dir }), /does not exist/);
});

test('judge --replicates counts runs of another experiment with the byte-identical rebuilt archive toward SC-004, and refuses a different input or an unjudged replica', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-judge-rep-'));
  const same = (id, runs) => record(id, runs);
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(same('a', [run()])));
  fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify(same('b', [run()])));
  const other = record('c', [run()]);
  other.inputs.rebuilt_sha256 = 'z';
  fs.writeFileSync(path.join(dir, 'c.json'), JSON.stringify(other));
  assert.throws(
    () => judge({ id: 'a', run: 1, observed: 'moved', match: true, replicates: ['b'], dir }),
    /not a fully judged/,
  ); // b not judged yet
  assert.equal(judge({ id: 'b', run: 1, observed: 'moved', match: true, dir }).status, 'UNKNOWN');
  const r = judge({ id: 'a', run: 1, observed: 'moved', match: true, replicates: ['b'], dir });
  assert.equal(r.status, 'PASS');
  assert.equal(r.replicates[0].experiment_id, 'b');
  assert.match(r.notes, /2\/2 runs of the same input/);
  assert.throws(
    () => judge({ id: 'a', run: 1, observed: 'moved', match: true, replicates: ['c'], dir }),
    /not the same input/,
  );
  assert.throws(
    () => judge({ id: 'a', run: 1, observed: 'moved', match: true, replicates: ['a'], dir }),
    /cannot replicate itself/,
  );
});
