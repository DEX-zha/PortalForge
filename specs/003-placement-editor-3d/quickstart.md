# Quickstart: validating the 3D placement editor

Runnable scenarios that prove the feature works end to end. Each states what to run and what must be true
afterwards. Paths are relative to `tools/ssa-archive/`. Scenarios 1 to 4 write nothing to the game; scenarios 5
to 7 do, and 6 and 7 consume boots, which the researcher counts.

**Prerequisites**

- `node cli.mjs gates` reports M0, M1, M2 and M3 as PASS.
- The tutorial workspace exists: `../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded`.
- The runtime fixup map exists: `../../.local/dolphin-evidence/ptr-scan3-fixups.json`.
- For scenarios 6 and 7, the emulator bridge is available and a figure file is at hand.

---

## Scenario 1 — The level opens and matches the known census

```
node cli.mjs edit serve ../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded \
  --archive level/Level_027_Tutorial.bld --entry 3 \
  --fixups ../../.local/dolphin-evidence/ptr-scan3-fixups.json --open
```

**Expected**: the process prints a session id and a URL, and the browser shows boxes forming a recognisable island.

**Must be true**: the number of proxies equals the number of placements the corpus report records for this file,
673, and the layer list contains `Plants`, `Loot`, `OpeningCS` and `Jump pads_PushBLock_Gates`. Compare against
`docs/placement-corpus-v1.json` rather than trusting the view.

Covers FR-001, FR-002, FR-006, SC-001, SC-002.

---

## Scenario 2 — The coordinate mapping is not mirrored

Frame the level from above and compare with an in-game screenshot of the same island, for example
`.local/dolphin-evidence/m3-level_027_tutorial-e3-1789301970935-run1-46-tutorial-skylander.png`.

**Must be true**: the windmill, the wooden bridge and the two sunflowers sit on the same side of the spawn point
in the view as they do in the screenshot. If the layout is mirrored, negate one horizontal axis in the single
place the mapping is defined and repeat.

This is the verification the Phase 0 research left open (R7). **Until it passes, no spatial judgement made in the
editor is trustworthy**, so run it before anything else that involves moving an object.

---

## Scenario 3 — An object reports what the project knows about it

Select the windmill blades, at offset `0x324C44`.

**Must be true**: the inspector shows the model path ending in `WindmillBlades.mdl`, a behaviour script ending in
`027_WindmillProp.ai`, the layer `Jump pads_PushBLock_Gates`, and a safety rule of severity `medium` explaining
that a scripted placement has been observed both to survive and to break a level when moved. The model and
behaviour attributes are marked as runtime-confirmed, because this level has a fixup map.

Then select a `CS_PortalEntry` marker: it must be drawn differently, report no model, and carry the rule that says
it is a marker rather than a visible prop.

Covers FR-003, FR-007, FR-008, FR-009, FR-019, SC-003.

---

## Scenario 4 — A refusal happens before anything is written

Attempt to duplicate `sunflower_Template(1)` at `0x3495E4` over `weed_2_Template(8)` at `0x34AC60`.

**Must be true**: the interface lists, before any confirmation is possible, the critical rule naming the shared
model record used by 26 placements, and confirmation is impossible until that rule is acknowledged explicitly.
Attempt then a duplication onto a slot of a different size: it is refused outright and no acknowledgement can
enable it.

Covers FR-016, FR-017, FR-018, FR-020, SC-005.

---

## Scenario 5 — A save changes only what was edited

Move one plant a visible distance, then save.

**Must be true**: the returned plan is `VALID`, `file_length_unchanged` is true and `bytes_changed_outside` is
zero. Confirm independently:

```
node cli.mjs bindiff ../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded <the saved file>
```

The only differing words are the transform fields of the edited placement. Then make an edit that the validation
must reject and confirm that no file is produced and no patch is offered.

Covers FR-021, FR-022, SC-004, SC-006.

---

## Scenario 6 — The change is visible in the running game (tutorial)

**Costs two boots.** Patch and launch from the editor with a prediction stated first, for example moving a
sunflower several units and predicting where it will stand relative to the windmill. Record the observation
afterwards. Repeat the identical input once.

**Must be true**: the level loads and plays, the predicted change is visible in both runs, and two experiment
records exist carrying the same rebuilt archive hash, the prediction and the observation. Use
`node cli.mjs shot diff <baseline.png> <new.png>` to make the visible difference evidence rather than an
impression.

Covers FR-023, FR-024, FR-025, SC-007, SC-008.

---

## Scenario 7 — The editor works on a level it has never seen

**Costs two boots.** Repeat scenarios 1, 3, 5 and 6 on `Level_000_Mining`, which has 617 placements, 374 of them
with a resolved model, and no runtime fixup map.

```
node cli.mjs edit serve ../../.local/workspaces/mining-bld/entries/3-level.bld.decoded \
  --archive level/Level_000_Mining.bld --entry 3 --open
```

**Must be true**: the placements are found with no per-level configuration, every attribute derived from a pointer
is marked structural rather than runtime-confirmed, and the edited object moves in game across two identical runs.

Until this scenario passes, the editor is a tutorial-specific tool and should be described as one.

Covers FR-013 evidence reporting without a runtime map, User Story 4, SC-007.

---

## Scenario 8 — A running session is not overwritten

While a launched run is still open, ask the editor to patch again.

**Must be true**: the request is refused with the session lock as the reason, and the previous patch directory is
untouched. Record an observation to release the lock, then confirm the patch succeeds.

Covers FR-026.

---

## Regression that must keep passing

The editor must not change what is already proven. After any work on this feature:

```
node --test
node cli.mjs corpus ../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded ... --fixups <file>=<map>
```

**Must be true**: the whole suite passes, the corpus report still validates every record against the frozen
contract, and the duplication that was confirmed in game still reproduces byte for byte:

```
node cli.mjs edit replace ../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded 0x3495e4 \
  --over 0x34ac60 --fixups <map> --pos 85.5,10,42 --out <tmp>
cmp <tmp> ../../.local/workspaces/tutorial-bld/sunflower-dup.decoded
```

---

## Run notes

**Scenario 5, run 2026-09-13 on the tutorial (T039), passed.** `sunflower_Template(1)` at `0x3495E4` moved from
(82.252, 9.962, 41.948) heading 285 scale 100 to (88.5, 10.2, 44.5) heading 200 scale 150, saved through the API.
The plan reported VALID, five changes, file length unchanged, zero bytes changed outside. An independent byte
comparison of the two files found exactly five differing words, all inside the edited placement, at +0x24, +0x28,
+0x2C, +0x34 and +0xB8. A second save after an undo was refused with "nothing to save" and produced no file.

That run also caught a real defect. Undo was restoring the *displayed* value rather than the stored bytes: the
inspector shows 82.252 while the file holds 82.25200653076172, so undoing rewrote the field with a nearby float
and left the buffer one word away from how it opened. Undo now copies the original words back verbatim, and
`tests/editor-session.test.mjs` has a regression for it.

**Scenario 2 (T024), passed by derivation rather than by eye.** See the R7 outcome in `research.md`: four judged
in-game runs fix the view direction as +z and screen-right as -x, which makes the game right-handed with y up,
the same as three.js. No axis is negated.

**Scenario 8 (T040) is still open.** The session lock is covered at the API level in
`tests/editor-api-edit.test.mjs`, where a launch takes the lock and a rebuild is refused with `SESSION_LOCKED`.
Doing it as the scenario describes, against a game that is actually running, needs the boot that T041 spends.
