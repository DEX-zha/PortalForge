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

## Archive redirect — 2026-09-17

- Added after the user's second message ("choosing the level is the point, and Patch must load that level in
  game"). `tests/editor-redirect.test.mjs`: the voice pack in the catalogue and extracted on open, the redirect
  macro, the second descriptor with both files under the tutorial names and the same rebuilt archive, launch
  selection (direct modes run the redirect, normal play the plain patch, `NO_REDIRECT_PATCH` without a voice
  pack), a redirected run preparing the checkpoint, replaying the redirect macro and proving consumption, and the
  per-level status read from `docs/level-entry-status.json`.
- **Two identical boots on Mining, PASS** (`research-probes/redirect-boot.mjs`, the editor's own open → edit →
  save → patch → launch path, an emerald raised 8 units as the edit):

| Run | When (UTC) | Checkpoint | Consumption | Captures |
|---|---|---|---|---|
| `editor-direct-test-1789649812643-1296e432` | 12:56 → 13:00 | prepared for the Mining layout, state `7f1a2207d666…`, FST `8894f3330ea9…` | `level/Level_027_Tutorial.bld` at 12 662 kB (Mining's size; the tutorial's is 15 333 kB) | visiting-Skylander prompt, then the mine cave and Blobbers' opening dialogue |
| `editor-direct-test-1789650170738-0c8c6b0a` | 13:02 → 13:04 | the same checkpoint reused | the same line at 12 662 kB | the same four frames |

  The redirected archive is byte-identical in both runs (`570eb16dd3f6a735…`); both stopped cleanly and restored
  the slot. Finding `level.entry.archive-redirect` **CONFIRMED** on Mining; the other families are LIKELY in
  `docs/level-entry-status.json` until their own two boots. The capability rows and chips read CONFIRMED on
  Mining and LIKELY elsewhere once a level's voice pack is extracted.
- The edited emerald sits far from the opening camera, so those runs say nothing about
  `level.transform.other-levels`; the lantern runs below do.

## Moving an object on another level — 2026-09-17

Mining's two opening-scene lanterns, `Lantern_01` and `Lantern_01(1)` (`Mine_Lantern.mdl`, `Lantern_Generic.ai`),
lowered by 5 units through the same path (`redirect-boot.mjs --prop "Lantern_01,Lantern_01(1)" --raise -5`),
then two identical boots; the effect is judged by `shot diff` against capture 08 of the emerald run
`editor-direct-test-1789650170738-0c8c6b0a`, where the lantern hangs in the top-left corner.

| Run | When (UTC) | Patch | Largest diff cluster against the emerald run |
|---|---|---|---|
| `editor-direct-test-1789650694320-cf7db99e` | 13:11 → 13:13 | `31c3c07852c27532…` | 112×94 px at (0, 32), 6 135 px: the lantern's place, now bare wall; a 43×60 px cluster at (0, 114) is its glow, lower |
| `editor-direct-test-1789650921032-81b4cf69` | 13:15 → 13:17 | the same bytes | 112×96 px at (0, 32), 6 445 px: the same |

Between the two lantern runs no cluster exceeds 1 457 px (the glow's flicker, Blobbers' animation, a dialogue
character): the boots agree. Same checkpoint as the emerald runs, consumption at 12 662 kB both times, clean
stops. Finding `level.transform.other-levels` **CONFIRMED**: transforms read CONFIRMED on Mining and on the
tutorial, LIKELY on the levels not booted with an edit yet (SC-004 done). The diff crops are under
`.local/level-check/lantern-diff-08-*.png`.

## Objects reported misplaced on Mining — 2026-09-17

- `Rock_Breakable_Half`, `Switch_90_Art_Template`, `Mine_Train_Template` and the like are stored templates: bit 0
  of the +0x54 word, exactly 4 or 5 on every record of both levels measured (research). `scene-roles.mjs` now
  reads it with the class detected for the file: Mining gets 236 resources, the tutorial keeps 296, the previews
  stay tutorial-only. `tests/editor-scene-poses.test.mjs` checks the five named objects and four placed controls.
- One probe boot (`editor-direct-play-1789652048727-d8dbe468`, 13:34 → 13:36): in MEM1 the placed controls read
  state 1 with actors, the stored records state 5 with no actor at their storage coordinates. Finding
  `igz.placement.inactive-flag`, LIKELY. The editor server on port 7400 was restarted on the new code: the
  catalogue reports 236 resources, 357 scripted, 23 markers and 1 static object for Mining.

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
