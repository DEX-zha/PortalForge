import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '../src/igz/graph.mjs';
import { resolveAll } from '../src/igz/model-resolve.mjs';
import { assessPlacement } from '../src/editor/safety.mjs';
import { deriveLayers } from '../src/editor/session.mjs';
import { renderPlacement, renderGrades } from '../src/view/inspector.mjs';

// Feature 003. The inspector is a pure function from a placement record to markup, so what it says can be checked
// here instead of by looking at a panel. The rendering of the 3D scene cannot be checked this way and is not
// pretended to be: this file covers what the researcher READS, the quickstart covers what they SEE.

const here = path.dirname(fileURLToPath(import.meta.url));
const TUTORIAL = path.resolve(here, '../../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded');
const MAP = path.resolve(here, '../../../.local/dolphin-evidence/ptr-scan3-fixups.json');
const haveSamples = fs.existsSync(TUTORIAL) && fs.existsSync(MAP);   // the constitution: fixture tests skip without local samples

function tutorial() {
  const buf = fs.readFileSync(TUTORIAL);
  const fixups = JSON.parse(fs.readFileSync(MAP, 'utf8'));
  const res = resolveAll(buf, buildGraph(buf, { fields: false }), fixups);
  const at = offset => res.rows.find(r => r.offset === offset);
  return { res, at, fixups };
}

test('inspector: a scripted prop shows its model, its script, its layers and the warning that goes with it', { skip: !haveSamples && 'local samples absent' }, () => {
  const { at } = tutorial();
  const blades = at(0x324c44);                                       // Windmill_Blades2
  const html = renderPlacement(blades, assessPlacement(blades, { hasRuntimeMap: true }), []);
  assert.match(html, /Windmill_Blades2/);
  assert.match(html, /WindmillBlades\.mdl/);
  assert.match(html, /027_WindmillProp\.ai/);
  assert.match(html, /Jump pads_PushBLock_Gates/);
  assert.match(html, /SCRIPTED_PLACEMENT/, 'the safety rule is shown, not only stored');
  assert.match(html, /medium/);
  assert.match(html, /moved fine over two boots/, 'the warning states the run that went well');
  assert.match(html, /froze twice/, 'and the one that did not, so the researcher weighs both');
  assert.match(html, /the game rewrote this word at load/, 'a runtime-confirmed attribute is marked as such');
  assert.match(html, /data-edit="position"[^>]*value="85\.515"/, 'the position is shown and typeable');
  assert.match(html, /data-edit="heading"[^>]*value="130"/);
  assert.match(html, /data-edit="scale"[^>]*value="100"/);
});

test('inspector: a marker says it is not a visible prop, and shows no model', { skip: !haveSamples && 'local samples absent' }, () => {
  const { res, at } = tutorial();
  const marker = res.rows.find(r => r.model.status === 'absent' && /CS_PortalEntry01/.test(r.name ?? ''));
  const html = renderPlacement(marker, assessPlacement(marker, { hasRuntimeMap: true }), []);
  assert.match(html, /CS_PortalEntry01/);
  assert.match(html, /marker, not a visible prop/);
  assert.match(html, /MARKER_NO_MODEL/);
  assert.doesNotMatch(html, /\.mdl/, 'no model path is invented for a marker');
});

test('inspector: a shared model record is spelled out with its user count before any duplication is offered', { skip: !haveSamples && 'local samples absent' }, () => {
  const { at } = tutorial();
  const weed = at(0x34ac60);                                          // weed_2_Template(8), model shared by 26
  const html = renderPlacement(weed, assessPlacement(weed, { hasRuntimeMap: true }), [{ offset: 0x3495e4, name: 'sunflower_Template(1)', span: weed.span }]);
  assert.match(html, /26 placements use this model record/);
  assert.match(html, /retextures all of them/, 'and what replacing that blob would do');
  assert.match(html, /1 of the same size/, 'the sacrificable slots are counted');
  assert.match(html, /the object in that slot stops existing/, 'and what taking one costs is said plainly');
  assert.match(html, /id="dup-confirm"[^>]*disabled/, 'nothing is confirmable before a plan has been prepared');
});

test('inspector: an attribute with no runtime evidence is not dressed up as one that has it', { skip: !haveSamples && 'local samples absent' }, () => {
  const buf = fs.readFileSync(TUTORIAL);
  const res = resolveAll(buf, buildGraph(buf, { fields: false }), null);   // same level, no runtime map
  const blades = res.rows.find(r => r.offset === 0x324c44);
  const html = renderPlacement(blades, assessPlacement(blades, { hasRuntimeMap: false }), []);
  assert.match(html, /not confirmed at runtime/);
  assert.doesNotMatch(html, /the game rewrote this word at load/);
  assert.match(html, /NO_RUNTIME_MAP/, 'and the level-wide caveat is shown too');
});

test('inspector: nothing selected renders an invitation, never a blank panel or a broken record', () => {
  assert.match(renderPlacement(null), /Nothing selected/);
});

test('inspector: the layer grade bar is proportional and names each severity', { skip: !haveSamples && 'local samples absent' }, () => {
  const { res } = tutorial();
  const layers = deriveLayers(res.rows, { hasRuntimeMap: true });
  const plants = layers.find(l => l.name === 'Plants');
  const bar = renderGrades(plants.grades);
  assert.match(bar, /class="bar"/);
  const widths = [...bar.matchAll(/width:([\d.]+)%/g)].map(m => Number(m[1]));
  assert.ok(widths.length >= 1);
  assert.ok(Math.abs(widths.reduce((a, b) => a + b, 0) - 100) < 0.5, 'the bar accounts for every placement of the layer');
  assert.match(bar, /title="(info|medium|high|critical|blocking): \d+"/);
});
