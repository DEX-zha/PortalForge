// Real-browser check of the level picker (feature 006): opens Mining by disc path, verifies the picker and the
// capability rows in a headless Edge with WebGL, switches to a Challenge level through the picker, and checks
// that unsaved edits are guarded by the discard dialog. Needs the local level data and Edge; starts no Dolphin.
//
//   node tests/browser-multilevel.mjs            from tools/ssa-archive
//
// Output: captures and result.json under .local/level-check/browser-<time>/.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { openLevel } from '../src/editor/level-open.mjs';
import { startServer } from '../src/editor/server.mjs';
import { editorDeps } from '../src/cli/commands/edit.mjs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const out = path.resolve('../../.local/level-check/browser-' + Date.now());
fs.mkdirSync(out, { recursive: true });

const session = await openLevel('Level_000_Mining');
const server = await startServer({ session, port: 0, deps: editorDeps({}) });
const profile = path.join(out, 'profile');
const browser = spawn(
  EDGE,
  [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-background-networking',
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    '--window-size=1600,1000',
    '--user-data-dir=' + profile,
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
);
let ws, launchError;
browser.on('error', e => (launchError = e));
const result = { steps: [], errors: [] };
try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200 && !fs.existsSync(portFile); i++) {
    if (launchError) throw launchError;
    await sleep(100);
  }
  assert.ok(fs.existsSync(portFile), 'Edge did not start');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let seq = 0;
  const pending = new Map(),
    errors = result.errors;
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
    if (!m.id) return;
    const p = pending.get(m.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq,
        timer = setTimeout(() => reject(new Error('CDP timeout ' + method)), 30000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const waitFor = async (expression, ticks = 300) => {
    for (let i = 0; i < ticks; i++) {
      try {
        if (await evaluate(expression)) return;
      } catch {
        /* the page is reloading */
      }
      await sleep(100);
    }
    throw new Error('Timeout: ' + expression + '\n' + JSON.stringify(errors));
  };
  const shot = async name =>
    fs.writeFileSync(
      path.join(out, name + '.png'),
      Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
    );
  const step = (name, data = {}) => result.steps.push({ name, ...data });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: server.url });
  await waitFor(`document.querySelectorAll('[data-object]').length === 617`);
  await waitFor(`document.getElementById('level-switch').hidden === false`);
  const picker = await evaluate(
    `(() => { const p = document.getElementById('level-picker'); return { options: p.options.length, groups: p.querySelectorAll('optgroup').length, selected: p.value, text: p.selectedOptions[0]?.textContent }; })()`,
  );
  assert.equal(picker.options, 76, 'every level of the disc is offered');
  assert.equal(picker.groups, 5);
  assert.equal(picker.selected, 'level/Level_000_Mining.bld');
  assert.match(picker.text, /Level_000_Mining · 617/);
  step('picker', picker);

  const capabilities = await evaluate(
    `[...document.querySelectorAll('#capabilities .row')].map(r => [r.querySelector('.k').textContent, r.querySelector('.v').textContent])`,
  );
  assert.deepEqual(capabilities, [
    ['Move / rotate / scale', 'LIKELY'],
    ['Duplicate', 'not available'],
    ['Add', 'not available'],
    ['Automatic test', 'not available'],
    ['Direct entry', 'not available'],
  ]);
  step('capabilities', { capabilities });
  assert.equal(await evaluate(`document.getElementById('launch-mode').value`), 'play', 'no macro outside the tutorial');
  const diag = await evaluate(`document.getElementById('diag').textContent`);
  assert.match(diag, /scenery blocks/);
  step('mining-drawn', { diag });
  await shot('01-mining');

  // An edit, then Open: the discard dialog must stand between the two.
  const first = await evaluate(`Number(document.querySelector('[data-object]').dataset.object)`);
  await evaluate(
    `fetch('/api/edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'transform', target: ${first}, heading: 33 }) }).then(r => r.json())`,
  );
  await evaluate(`document.getElementById('level-picker').value = 'level/Challenge_Level_005.bld'`);
  await evaluate(`document.getElementById('level-open').click()`);
  await waitFor(`document.getElementById('open-dialog').open === true`);
  const summary = await evaluate(`document.getElementById('open-summary').textContent`);
  assert.match(summary, /1 unsaved edit/);
  step('discard-dialog', { summary });
  await shot('02-discard-dialog');
  await evaluate(`document.getElementById('open-cancel').click()`);
  assert.equal(await evaluate(`document.getElementById('open-dialog').open`), false);
  assert.equal(await evaluate(`document.querySelectorAll('[data-object]').length`), 617, 'cancel keeps the level');

  await evaluate(`document.getElementById('level-open').click()`);
  await waitFor(`document.getElementById('open-dialog').open === true`);
  await evaluate(`document.getElementById('open-discard').click()`);
  await waitFor(`document.querySelectorAll('[data-object]').length === 411`);
  await waitFor(`document.getElementById('level-switch').hidden === false`);
  const after = await evaluate(
    `(() => { const p = document.getElementById('level-picker'); return { selected: p.value, file: document.getElementById('file').textContent, dirty: document.getElementById('dirty').textContent }; })()`,
  );
  assert.equal(after.selected, 'level/Challenge_Level_005.bld');
  assert.equal(after.dirty, '', 'the discarded edit is gone');
  step('switched', after);
  const levels = await evaluate(`fetch('/api/levels').then(r => r.json()).then(b => b.current)`);
  assert.equal(levels.archive, 'level/Challenge_Level_005.bld');
  await shot('03-challenge-005');

  // Back to the tutorial: its confirmed capabilities come back with it.
  await evaluate(`document.getElementById('level-picker').value = 'level/Level_027_Tutorial.bld'`);
  await evaluate(`document.getElementById('level-open').click()`);
  await waitFor(`document.querySelectorAll('[data-object]').length === 673`);
  await waitFor(`document.querySelectorAll('#capabilities .row').length === 5`);
  const tutorial = await evaluate(
    `[...document.querySelectorAll('#capabilities .row')].map(r => r.querySelector('.v').textContent)`,
  );
  assert.deepEqual(tutorial.slice(0, 3), ['CONFIRMED', 'CONFIRMED', 'CONFIRMED']);
  step('tutorial', { capabilities: tutorial });
  await shot('04-tutorial');

  assert.deepEqual(errors, [], 'no JavaScript exception in the page');
  result.status = 'PASS';
} catch (e) {
  result.status = 'FAIL';
  result.failure = e.message;
  throw e;
} finally {
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  ws?.close();
  browser.kill();
  await server.close();
  console.log(`${result.status} ${out}`);
}
