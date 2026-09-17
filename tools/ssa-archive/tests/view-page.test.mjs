import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Feature 003. The viewport read as empty for three rounds, and none of it was a rendering problem. The page was
// served without a doctype, and an #error overlay that the hidden attribute never actually hid sat on top of the
// canvas with an opaque background. Both are properties of a static file, and both are checkable here.

const view = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/view');
const html = fs.readFileSync(path.join(view, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(view, 'app.mjs'), 'utf8');

test('the page declares a doctype, so the browser does not fall back to quirks mode', () => {
  assert.match(
    html.slice(0, 200),
    /^<!DOCTYPE html>/i,
    'without this the height chain does not resolve and the viewport column collapses to nothing',
  );
});

test('the hidden attribute actually hides, which a display declaration would otherwise beat', () => {
  // [hidden] is a user-agent rule of the lowest specificity. #error carries display:grid, so without an explicit
  // override the overlay is laid out at full size with an opaque background and covers whatever is behind it.
  assert.match(
    html,
    /\[hidden\]\s*{\s*display:\s*none\s*!important/,
    'every element written as hidden in the markup is only hidden if this rule is present',
  );

  for (const [, id] of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*\bhidden\b/g)) {
    const rule = new RegExp(`#${id}\\s*{[^}]*display:`, 's');
    if (rule.test(html)) {
      assert.match(
        html,
        /\[hidden\]\s*{\s*display:\s*none\s*!important/,
        `#${id} is written hidden but is also given a display, so it needs the override above`,
      );
    }
  }
});

test('an overlay that covers the viewport is not left in the markup without a way to hide it', () => {
  const overlay = /#error\s*{[^}]*}/s.exec(html)?.[0] ?? '';
  assert.match(overlay, /position:\s*fixed/, 'an error inside a collapsed column is an error nobody reads');
  assert.match(html, /<div id="error" hidden>/, 'it must start hidden');
  assert.match(app, /\$\('error'\)\.hidden = true/, 'and something must put it back');
});

test('every element the view addresses by id exists in the page', () => {
  // This is the check that would have caught the counts-to-tally rename: a missing element throws on the first
  // line that touches it, and everything after it in main() silently does not happen.
  // The page is not the only source of ids: inspector.mjs writes the selection panel, including the duplication
  // controls, into the DOM when a proxy is picked.
  const inspector = fs.readFileSync(path.join(view, 'inspector.mjs'), 'utf8');
  const ids = new Set([...(html + inspector).matchAll(/\bid=\\?"([^"\\]+)/g)].map(m => m[1]));
  const used = new Set([...app.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
  const missing = [...used].filter(id => !ids.has(id));
  assert.deepEqual(missing, [], `the view addresses ids the page does not define: ${missing.join(', ')}`);
});

test('every bare module specifier the view imports is covered by the import map', () => {
  const map = JSON.parse(/<script type="importmap">\s*([\s\S]*?)\s*<\/script>/.exec(html)[1]).imports;
  const prefixes = Object.keys(map);
  for (const file of fs.readdirSync(view).filter(f => f.endsWith('.mjs'))) {
    const src = fs.readFileSync(path.join(view, file), 'utf8');
    for (const [, spec] of src.matchAll(/\bfrom\s+'([^']+)'/g)) {
      if (spec.startsWith('.') || spec.startsWith('/')) continue;
      assert.ok(
        prefixes.some(p => (p.endsWith('/') ? spec.startsWith(p) : spec === p)),
        `${file} imports ${spec}, which no import map entry resolves`,
      );
    }
  }
});

test('the page carries no build step, so what is served is what is read', () => {
  assert.ok(!html.includes('type="module" src="/dist/'), 'a bundled path would break the no-build-step rule');
  assert.match(html, /<script type="module" src="\/view\/app\.mjs">/);
});
