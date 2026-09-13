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



**Scenario 6 (T041) passed on the third attempt, 2026-09-13: `m3-level_027_tutorial-e3-1789323431499`, PASS 2/2.**
Two boots in one runner call, so both used the identical rebuilt archive. The whole chain ran through the editor:
an intent, an in-memory edit, a save whose plan was checked against the bytes actually written, a replacement-only
patch, and a launch with the prediction stated before the game started. Both runs show the sunflower hanging high
above its normal spot with its twin unchanged; the two runs differ only in the windmill blade angle and the clouds.

Cost: four boots for a two-boot task. Two were lost, one to the launch timeout defect described above and one to an
accidental window close. The defect is fixed; the window close is not the tool's fault but it is why the record is
written by the runner's `finally`, and why killing the process still loses it.

**What the first two attempts cost, kept because it is the reason the launch is polled.**

**Scenario 6 (T041), first attempt: two boots spent, no judged record.**

Boot 1, `m3-level_027_tutorial-e3-1789322456771`. The editor's own chain ran: `sunflower_Template(1)` at
`0x3495E4` moved straight up, y 9.962 to 16, one variable and nothing else touched; the save reported VALID with
five changed words and none outside; the patch built; the game launched. **The effect is unmistakable in the
screenshots**: one sunflower hangs high above the windmill roof line while its twin stays at its normal height,
and a pixel diff against the baseline puts the two largest changed clusters exactly where the plant arrived and
where it left. What is missing is the experiment record. The launch endpoint held the HTTP response open for the
whole run, the client's header timeout fired at five minutes, the script died and took the in-flight run with it
before the runner reached the `finally` that writes the record.

That is a real defect and it is fixed: `POST /api/launch` now returns as soon as the run is under way, `GET
/api/launch` reports its state, and the view polls instead of waiting. The contract says so, and the tests assert
that the id is null while the run is running rather than being invented.

Boot 2, `m3-level_027_tutorial-e3-1789323012435`. Interrupted at the intro cinematic when the emulator window was
closed by accident. Screenshots up to step 25, no record.

**So the evidence stands at: one complete run whose effect is visible, zero runs judged into a record.** SC-007
asks for the predicted change observed in two identical runs, so scenario 6 is not met and T041 is not done. Two
further boots would close it; one would at least produce a judged record for the run that already worked.


**Scenario 4 (T049) passed on the tutorial, 2026-09-13, no boot.** Duplicating `sunflower_Template(1)` over
`weed_2_Template(8)`: the editor offers exactly one slot, which is that weed; preparing the plan reports the
wrapper-proven recipe and **both** critical rules before any confirmation exists, naming the record at `0x34AC60`
with its 2 external users and the model record at `0x34ADB0` used by 26 placements, with the model name changing
from `plants_weed2_whole.mdl` to `plant_sunflower_whole.mdl`; confirming without acknowledging is refused with
`ACKNOWLEDGEMENT_REQUIRED`; a slot of a different size is refused with `SPAN_MISMATCH` and no acknowledgement
enables it; and with the acknowledgement the slot takes the sunflower model while keeping its own name, with the
file on disk still untouched until a save.

**The duplication made through the editor is byte-identical to the file two boots confirmed.** Saving it produces
exactly `sunflower-dup.decoded`, the file behind `m3-…-1789303984407` and `m3-…-1789304493862`. That is as
close to in-game proof as a run without a boot can get, and it is why User Story 3 spends none.

That scenario also corrected a real defect. The session refused a duplication when the two placements' **table
spans** differed, which rejects the one pair proven to work: the confirmed recipe copies a 0x1C8 wrapper over
another 0x1C8 wrapper, while the table records around them are 0x1498 and 0x834 apart. The editor now compares
the block the recipe actually copies, and a wrapped placement is never offered as a stand-in for an unwrapped one.


**Scenario 7 (T053) is blocked, and no boot was spent finding that out.** Replacing `Level_000_Mining.bld` and
booting would load the tutorial: the only automated path into the game is `input-scripts/level-027-entry.json`,
which walks the menus of a fresh save and waits for `level/Level_027_Tutorial.arc`. Mining is never read, so the
edited archive would never be touched and two boots would show nothing. The save states that exist are slot 6,
the tutorial start, and a few scratch slots; none is in Mining.

What the editor already proves about Mining without a boot, in `tests/editor-multilevel.test.mjs`: it opens with
no per-level configuration, detects class 98 rather than the tutorial's 104, finds 617 placements and 374 models
matching the corpus report, marks every pointer-derived value structural, refuses duplication for want of a
runtime map while still allowing transforms, and a save changes exactly the three position words and nothing else.

Three ways forward, none of them free:

1. **A save state inside Mining.** Play there once and save a state; the runner now understands a `load_state`
   step, so the scenario then costs its two boots and nothing more. This is the cheapest and the most honest.
2. **Prove the structural path in game on the tutorial instead**, by opening the tutorial with no fixup map so
   every value is structural, editing, and booting. It does not prove a second level, but it does prove the
   editor does not depend on runtime evidence, which is the real risk behind User Story 4.
3. **Write an input script that plays from the tutorial to Mining.** Long, fragile, and likely to waste several
   boots before it works.


**Option 2 was checked and is not worth a boot, 2026-09-13.** The plan was to open the tutorial WITHOUT its
runtime fixup map, so every value would be structural, edit it and boot. A byte comparison settles it for free:
opening the same level with and without the map produces **byte-identical saved files**, and all 673 placements
resolve the same model, the same status and the same layers either way. The map changes what the editor CLAIMS
about a value, not what it writes. A boot of the structural path could therefore only reproduce what T041 already
showed, so none was spent, and `tests/editor-multilevel.test.mjs` now guards the equivalence: if the two paths
ever diverge, a level read structurally would be edited differently from the same level read with its map, and
nothing in game would say which one was right.

That leaves exactly one thing unproven for User Story 4, and it is the one the story is about: **a level other
than the tutorial, loaded by the game, showing an edit.** Only option 1 answers it.

**Scenario 2 (T024), passed by derivation rather than by eye.** See the R7 outcome in `research.md`: four judged
in-game runs fix the view direction as +z and screen-right as -x, which makes the game right-handed with y up,
the same as three.js. No axis is negated.

**Scenario 8 (T040) is still open.** The session lock is covered at the API level in
`tests/editor-api-edit.test.mjs`, where a launch takes the lock and a rebuild is refused with `SESSION_LOCKED`.
Doing it as the scenario describes, against a game that is actually running, needs the boot that T041 spends.
