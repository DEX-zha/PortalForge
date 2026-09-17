# Editor roadmap

Ordered on 2026-09-17 from the user's request: every object placeable and working, any level loadable and
editable, not only the tutorial. Each step names its cost, what unlocks it, and the evidence rule that closes it.
Nothing moves from a step to the editor without a finding; a run does not unlock a feature, a confirmed finding
does. Gates: M0–M3 PASS, M4A/M4B/M5 UNKNOWN.

| # | Step | State | Cost | Evidence rule |
|---|---|---|---|---|
| 1 | Open any level and move its objects | **Delivered offline** ([spec 006](../../specs/006-multi-level-editing/spec.md)); in-game proof pending | done; two boots on one level remain | two identical cold boots of an edited non-tutorial level, reached through normal play, promote `level.transform.other-levels` to CONFIRMED |
| 2 | Runtime maps per level, on demand | Tooling exists (`experiment ptr-scan`, `igz fixups`); folder and config lookup wired by step 1 | one boot per level plus navigation to it | a map is a runtime read, not a guess: the resident section diffed against the file |
| 3 | Family campaign on the tutorial: from 9 Add sources towards 234 families | Tooling exists (**Test next 2 types**); waits for a decision on the promotion rule | about 9 minutes of Dolphin per family; over 30 hours at the current per-source rule | two identical boots per exact source today; promoting a script-less family from one member is a constitution change the user has to make |
| 4 | More than eight additions per patch | Not started | rewrite the Gecko recipe as a loop over a data table instead of one code block per addition, then two boots | the reserved code area is 3 256 bytes; eight additions use 2 344 |
| 5 | Direct entry per level | Not started; the checkpoint mechanism is generic, the navigation is not | one macro per level plus a save where the level is unlocked | the same rule as the tutorial: checkpoint before load, FST bound, current patch re-read after restore |
| 6 | Native additions outside the tutorial, and gameplay of added objects (M5) | Research | unknown | the addition recipe is anchored on the tutorial's readiness and activation observers; survival, collection and combat have no proof anywhere |

## Step 1 — what was delivered on 2026-09-17

- `edit levels` lists the 76 levels of the disc with their state; `edit open <level>` extracts, decodes and serves
  any of them by name; the editor's header has a picker and **Open**, guarded by a discard dialog.
- Every level carries its capabilities with the finding behind each: transforms LIKELY outside the tutorial,
  duplication only with a runtime map, additions, the automatic test and direct entry tutorial-only.
- Objects and terrain: parked objects (boss cameras at 30480, 30480, 30480; switch templates near z = -815) no
  longer size the view; Haunted Castle goes from a 31 299-unit extent to 1 175. Five non-tutorial levels were
  rendered headless and one real-browser scenario switches Mining → Challenge 005 → tutorial with no exception.
- 319 SSA tests and 6 MCP tests pass. No Dolphin boot was made.
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
