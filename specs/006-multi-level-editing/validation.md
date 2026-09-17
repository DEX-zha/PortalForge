# Validation — 2026-09-17

## Result

Step 1 of the roadmap is delivered offline: every one of the 76 levels opens by name from the command line and
from the editor, transforms work on all of them with the LIKELY label they deserve, switching is guarded, and the
view reads correctly on levels that park objects far away. **No Dolphin boot was made**; the in-game effect of an
edit on a non-tutorial level stays unproven (SC-004 pending), and `level.transform.other-levels` is LIKELY, not
editable.

## Offline evidence

- **Catalogue on the reference machine**: 76 levels, 76 decoded, one runtime map (tutorial, source `default`),
  76 placement counts from the corpus. Title has 0 placements and is refused on open with the session's reason.
- **Opening**: Mining in 132 ms (617 placements, class 98, no map); switching to the tutorial restores its nine
  Add sources, capacity 0/8 and direct entry; Haunted Castle opens with 1 231 placements.
- **Suites**: `npm test` in `tools/ssa-archive` **319/319** (six new test files: catalogue 7, opening 7, routes 5,
  framing +1) and `tools/dolphin-mcp` 6/6.
- **Real browser** (`tests/browser-multilevel.mjs`, run `browser-1789648087080`, PASS): picker with 76 levels in 5
  groups, Mining selected; capability rows LIKELY / not available ×4; launch mode `play`; scenery drawn; an edit
  then Open shows the discard dialog naming 1 unsaved edit; Cancel keeps Mining; Discard and open loads
  Challenge 005 (411 objects) with an empty history; opening the tutorial shows CONFIRMED ×3; zero JavaScript
  exception. Captures under `.local/level-check/browser-1789648087080/`.
- **Objects and terrain**: headless previews with meshes of Mining, Haunted Castle, Hub stage 1, Challenge 005 and
  Dark Forest under `.local/level-check/`. Objects sit on the decoded scenery in all five. Before the parked rule
  Haunted Castle framed at 31 299 units with 284-unit proxies; after it 1 175 units, 10.7-unit proxies, 3 objects
  reported as parked. Troll hub: 495 units, 3 parked. The tutorial: 489 units, 0 parked, unchanged.

## Archive redirect — 2026-09-17, offline only

- Added after the user's second message ("choosing the level is the point, and Patch must load that level in
  game"). `tests/editor-redirect.test.mjs`, 7 tests: the voice pack in the catalogue and extracted on open, the
  redirect macro, the second descriptor with both files under the tutorial names and the same rebuilt archive,
  launch selection (direct modes run the redirect, normal play the plain patch, `NO_REDIRECT_PATCH` without a
  voice pack), and a redirected run preparing the checkpoint, replaying the redirect macro and proving
  consumption of the tutorial-named archive at the level's size.
- Suites: **326/326 SSA**, 6/6 MCP. Finding `level.entry.archive-redirect` UNKNOWN; `docs/level-entry-status.json`
  names the strategy for Mining and the other families.
- **No boot**. The first screening boot (direct-test on Mining, about 6 minutes with the checkpoint preparation)
  waits for the user's go-ahead, then two identical boots for SC-006.

## Limits

- The game has not been booted on any edited non-tutorial level. The only in-game transform proofs are the
  tutorial's. Two identical cold boots through normal play close this; they need the user at the controls.
- Duplication outside the tutorial waits for a runtime map per level (roadmap step 2). Additions, the automatic
  test and direct entry stay tutorial-only, unchanged by this feature.
- Big open levels keep small proxies in proxy-only mode (Hub stage 1: 3.4 px median); with meshes the picture
  reads correctly. One proxy size per level is the existing trade-off.
- Levels whose switch templates sit under three level-widths from the play area keep them in the extent, at the
  cost of a proxy up to twice the ideal size; a smaller threshold would have dropped real islands.
- The mesh payload of a large level is 15 MB of JSON per open; unchanged in nature from the tutorial's 10 MB.
