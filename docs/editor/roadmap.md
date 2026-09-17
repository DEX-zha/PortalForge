# Editor roadmap

Ordered on 2026-09-17 from the user's request: every object placeable and working, any level loadable and
editable, not only the tutorial. Each step names its cost, what unlocks it, and the evidence rule that closes it.
Nothing moves from a step to the editor without a finding; a run does not unlock a feature, a confirmed finding
does. Gates: M0–M3 PASS, M4A/M4B/M5 UNKNOWN.

| # | Step | State | Cost | Evidence rule |
|---|---|---|---|---|
| 1 | Open any level and move its objects | **Delivered and CONFIRMED on Mining** ([spec 006](../../specs/006-multi-level-editing/spec.md)): two identical boots showed a lowered lantern where the original hung | done | `level.transform.other-levels` CONFIRMED; a level reads CONFIRMED once it was booted with an edit (its row in `docs/level-entry-status.json`), LIKELY otherwise |
| 2 | Runtime maps per level, on demand | Tooling exists (`experiment ptr-scan`, `igz fixups`); folder and config lookup wired by step 1 | one boot per level plus navigation to it | a map is a runtime read, not a guess: the resident section diffed against the file |
| 3 | Family campaign: from 9 Add sources towards every family | **Replaced** by [spec 007](../../specs/007-unlimited-additions/spec.md): every object is addable and each launch verifies what it carried; a batch of one source per family verifies a level in one boot (156 families of Mining carry a report) | done for Mining; one boot per level | constitution 1.2.0: an experimental addition is verified by every run that carries it and never called confirmed; a family becomes a finding through two identical boots and review |
| 4 | More than eight additions per patch | **Delivered, LIKELY** (spec 007): 18 with the proven slot, 59 with the compact table, and more through the live table refilled while the game runs (152 on Mining, two boots) | done; play without the editor stays at 59 | `level.prop.native-addition-table-layout`, `level.prop.native-addition-refill`; Dolphin leaves 3 256 bytes for codes |
| 5 | Patch lands in the chosen level | **CONFIRMED on Mining** (archive redirect: the level's `.bld` and `.arc` served under the tutorial's names through the confirmed tutorial checkpoint; two identical boots on 2026-09-17), LIKELY for the other families | two identical boots per level family | `level.entry.archive-redirect`; a family moves to CONFIRMED in `docs/level-entry-status.json` when two boots land in one of its levels |
| 6 | Native additions outside the tutorial, and gameplay of added objects (M5) | Additions outside the tutorial **delivered, LIKELY** (spec 007: Mining, Undead Volcano, one challenge level; a level never measured is measured by its first launch). Gameplay of added objects: research | gameplay unknown | `level.prop.native-addition-other-levels`, `-live-table`, `-enemy-templates`; added enemies move and were seen on screen, but combat, loot and defeat have no proof anywhere |

## The main objective: add any object, anywhere, as many times as wanted

Specified on 2026-09-17 in [spec 007](../../specs/007-unlimited-additions/spec.md) with its
[plan](../../specs/007-unlimited-additions/plan.md): the native factory on every level with a measured capacity
instead of eight (phase A), the activation flag as an on/off switch to remove or reveal objects without a victim
(phase B), libraries imported between levels for the enemies that exist in a dozen levels only (phase C, gate
M4A), and campaigns that prove hundreds of sources without hand work (phase V). It supersedes steps 3, 4 and 6
of the table above.

State on 2026-09-17: every object of every level can be added from the editor, stored templates, enemies and
objects with nothing to draw included, and each launch verifies what it carried
([how it works](adding-objects.md) · [what was booted](../../specs/007-unlimited-additions/validation.md)). A level
never opened before is measured by its first launch; a scene takes more additions than the Gecko area holds (152
on Mining); added enemies move and fight. All of it is LIKELY: memory proves creation on two identical boots each,
and only the enemies were looked at on screen. Next: a table for play without the editor, the activation flag as a
remove/reveal switch, then objects of other levels.

## Readability of the view (asked on 2026-09-17, measured, not started)

| Item | Finding | Cost | Recommendation |
|---|---|---|---|
| "The view shows the level before its opening" | Measured false on Mining: 3 of 617 objects move at start-up, 313 are dormant until approached, the stored positions are the game's | **delivered**: the As in game layer draws a snapshot read from Dolphin (`level.runtime.scene-snapshot`) | capture a snapshot per level from the editor while it plays |
| Missing clones at puzzles | the objects a script creates (cannon, push-block art, fan blades, pick, key) are placement instances the game allocates at run time | **delivered in the snapshot**: created instances are found by their class pointer and drawn with their template's model | the script layer per file (class indices are the tutorial's) remains the way to show them without a boot |
| Textures | section 4 is CMPR, 224 images on Mining, UVs already parsed but not emitted, no image header layout yet | 2 to 3 days, read-only | after the two above; re-tile CMPR to DXT1 for the browser's S3TC path |
| Lights | one directional light and ambient per level | half a day | with textures |
| VFX | 4 500 particle definitions on Mining, no static appearance | not worth rendering | an emitter marker |

## Step 1 — what was delivered on 2026-09-17

- `edit levels` lists the 76 levels of the disc with their state; `edit open <level>` extracts, decodes and serves
  any of them by name; the editor's header has a picker and **Open**, guarded by a discard dialog.
- Every level carries its capabilities with the finding behind each: transforms LIKELY outside the tutorial,
  duplication only with a runtime map, additions, the automatic test and direct entry tutorial-only.
- Objects and terrain: parked objects (boss cameras at 30480, 30480, 30480; switch templates near z = -815) no
  longer size the view; Haunted Castle goes from a 31 299-unit extent to 1 175. Five non-tutorial levels were
  rendered headless and one real-browser scenario switches Mining → Challenge 005 → tutorial with no exception.
- Patch → Launch on another level: the launch mode defaults to **Direct level play via the tutorial slot** once
  the level's voice pack is extracted; the game loads the chosen level from the tutorial checkpoint. Confirmed on
  Mining by two identical boots (the mine and Blobbers' dialogue where the tutorial's opening would be), LIKELY
  on the other families; see [research](../../specs/006-multi-level-editing/research.md).
- A **Level** tab next to Project: one card per level with its state, its chips and Open; the current level with
  its files and its capabilities on the left.
- Stored templates and inactive objects (bit 0 of +0x54) are recognised on every level, not only the tutorial:
  Mining's mine-train and track-switch templates and rock halves leave the default view for the hidden
  "Templates and disabled objects" layer, as a memory read in the running game confirms they have no actor
  (`igz.placement.inactive-flag`, LIKELY).
- 336 SSA tests and 6 MCP tests pass.
- Evidence and limits: [validation](../../specs/006-multi-level-editing/validation.md) ·
  [usage](../../specs/006-multi-level-editing/quickstart.md) · [research](../../specs/006-multi-level-editing/research.md).

## History

- 2026-09-15, batch 1 of feature 004: the tutorial's 673 placements reachable, drop with preview and confirmation,
  stale plans refused, undo/redo and shared geometry kept up to date; a Unity-inspired workspace with Hierarchy,
  Scene, Inspector and Project. [Report](../../specs/004-object-workflow/validation.md) ·
  [interface](../../specs/004-object-workflow/interface.md).
- 2026-09-16, feature 005: eight native additions from nine confirmed sources, direct tutorial entry with a
  pre-load checkpoint, the family diagnostics and the automatic per-family tests.
  [Scope and evidence](../../specs/005-native-object-addition/validation.md) ·
  [usage](../../specs/005-native-object-addition/quickstart.md) · [launch guide](direct-entry.md) ·
  [per-level matrix](../level-entry-status.json).

Data, saves and captures stay local under `.local/`.
