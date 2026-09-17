import test from 'node:test';
import assert from 'node:assert/strict';
import { filterLevels, chip, renderCapabilities, FAMILY_LABELS, CAPABILITY_LABELS } from '../src/view/levels.mjs';
import { capabilitiesOf } from '../src/editor/level-catalog.mjs';

// Feature 006, the Level tab. The parts that decide what a card says are pure and checked here; the DOM wiring
// is exercised by tests/browser-multilevel.mjs in a real browser.

const levels = [
  { name: 'Level_000_Mining', archive: 'level/Level_000_Mining.bld', family: 'story' },
  { name: 'Level_027_Tutorial', archive: 'level/Level_027_Tutorial.bld', family: 'story' },
  { name: 'Challenge_Level_005', archive: 'level/Challenge_Level_005.bld', family: 'challenge' },
  { name: 'PvP_Level_010_Ice', archive: 'level/PvP_Level_010_Ice.bld', family: 'pvp' },
];

test('the level filter matches words against the name and the disc path, within a family', () => {
  assert.deepEqual(
    filterLevels(levels).map(l => l.name),
    levels.map(l => l.name),
  );
  assert.deepEqual(
    filterLevels(levels, 'mining').map(l => l.name),
    ['Level_000_Mining'],
  );
  assert.deepEqual(
    filterLevels(levels, 'LEVEL 0').map(l => l.name),
    ['Level_000_Mining', 'Level_027_Tutorial', 'Challenge_Level_005', 'PvP_Level_010_Ice'],
    'every word must match somewhere in the name or the path',
  );
  assert.deepEqual(
    filterLevels(levels, '', 'challenge').map(l => l.name),
    ['Challenge_Level_005'],
  );
  assert.deepEqual(filterLevels(levels, 'ice', 'story'), []);
  assert.equal(Object.keys(FAMILY_LABELS).length, 5);
});

test('chips say how far the evidence goes, and carry the reason in their title', () => {
  const tutorial = capabilitiesOf({ tutorial: true, runtimeMap: { file: 'm' }, directEntry: true });
  assert.deepEqual(
    Object.keys(CAPABILITY_LABELS).map(k => chip(k, tutorial[k]).cls),
    ['proven', 'proven', 'proven', 'proven', 'proven'],
  );
  assert.equal(chip('transform', tutorial.transform).text, 'Move');

  const other = capabilitiesOf({ tutorial: false, runtimeMap: null, directEntry: true, companion: true });
  const chips = Object.fromEntries(Object.keys(CAPABILITY_LABELS).map(k => [k, chip(k, other[k])]));
  assert.deepEqual(
    Object.values(chips).map(c => c.text),
    ['Move · likely', 'Duplicate · no map', 'Add · tutorial only', 'Test · manual', 'Direct entry · experimental'],
  );
  assert.deepEqual(
    Object.values(chips).map(c => c.cls),
    ['likely', 'withheld', 'withheld', 'withheld', 'experimental'],
  );
  assert.match(chips.duplicate.title, /ptr-scan/);
  assert.match(chips.direct_entry.title, /level\.entry\.archive-redirect/);

  const bare = capabilitiesOf({ tutorial: false, runtimeMap: null, directEntry: false });
  assert.equal(chip('direct_entry', bare.direct_entry).text, 'Direct entry · no');
  assert.equal(chip('direct_entry', undefined).cls, 'withheld', 'a missing capability is withheld, never proven');
});

test('the capability rows render the state, the reason on hover, and the reasons inline when asked', () => {
  const c = capabilitiesOf({ tutorial: false, runtimeMap: null, directEntry: true, companion: true });
  const rows = renderCapabilities(c);
  assert.match(
    rows,
    /Move \/ rotate \/ scale<\/span><span class="v likely" title="[^"]*level\.transform\.other-levels[^"]*">LIKELY<\/span>/,
  );
  assert.match(rows, /Direct entry<\/span><span class="v withheld" [^>]*>UNKNOWN · experimental<\/span>/);
  assert.match(rows, /Duplicate<\/span><span class="v withheld" [^>]*>not available<\/span>/);
  assert.ok(!rows.includes('level-why'), 'reasons stay in titles unless asked for');
  const long = renderCapabilities(c, { reasons: true });
  assert.ok(long.includes('level-why'));
  assert.ok(long.includes('<i>level.transform.other-levels</i>'));
  assert.equal(renderCapabilities(null), '');
  // The text reaching the page is escaped: a reason with markup cannot inject it.
  const hostile = { transform: { available: true, confidence: 'LIKELY', why: '<img src=x onerror=1>', finding: null } };
  assert.ok(!renderCapabilities(hostile).includes('<img'));
});
