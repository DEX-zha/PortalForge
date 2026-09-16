# Batch 1 validation — 2026-09-15

Following user feedback: **250 SSA tests and 6 MCP tests PASS** after adding the pointer-capture drop, the Reset scene button and switching the interface to English. The browser scenario now uses real mouse input, checks two destinations and the cancellations, then a reset after saving and the exact recovery through Redo. Details, commands and evidence: [interface.md, UI06–UI09](interface.md). The historical in-game validation below is still the one from batch 1; no new in-game run is claimed for these fixes.

## Result and scope

US1 delivered: a catalogue of every placement, search by name/model/layer, categories, selection with framing/reveal, drag and drop with a ghost, a visible surface or an adjustable horizontal plane, an explicit choice of the slot consumed, a full plan and critical acknowledgements. No write before confirmation. One confirmation = one edit, with exact undo/redo. Plans become stale after an edit, even an undone one. Scripted sources, inactive assets, and the absence of a model/runtime map or of a compatible size are explained and refused.

The scene and its models are rebuilt after a replacement and after undo/redo. A local geometry library keeps the original associations; a renamed shared model takes the meshes of the source asset that is already present. No cross-level transfer and no geometry write. An ambiguous association stays a proxy.

## Local checks

- `npm test`, tools/ssa-archive: **246/246 PASS**.
- `npm test`, tools/dolphin-mcp: **6/6 PASS**.
- Regression reproduced then fixed: the copy showed the victim's weed despite its sunflower path. Mesh test and captures after the fix: correct sunflower, the weed restored on undo then the sunflower on redo; scenery unchanged.
- Dedicated Edge WebGL browser, HTML5 events through CDP on the real elements: **673/673 objects**, case-insensitive search at **3 ms**, framing, preview, cancellation without mutation, victim not pre-selected, a critical rule blocking the confirmation, one edit, byte-identical undo/redo, a new drop available after confirmation, no browser exception.
- Isolated real Three.js scene: intersection at Y=5, hidden layer excluded and fallback at Y=2, wireframe taken into account, ghost ignored by the ray, drop outside the canvas/invalid altitude refused, camera preserved across the rebuild.
- Reports/captures: `.local/object-workflow/browser-1789505000412/`, `latest-browser.json`. Reproducible script: `tools/ssa-archive/tests/browser-catalog.mjs`.

## Two Dolphin boots

The browser's actual drop copies **sunflower_Template(1)** (0x3495E4) over the chosen slot **weed_2_Template(8)** (0x34AC60), position **[91.349, 10.435, 43.275]**, heading 285°, scale 100. Source preserved, victim name preserved, wrapper-proven recipe. The effects on the shared model were shown and acknowledged.

Saved entry SHA256: `957a13bd17757e8c0c6d76b23ac13761389693bba21571be4f17a2b0e5e25066`.
Rebuilt archive SHA256: `e3e7a9fbac23ab46ffb4188cb2776bddf5662c9efa023243caf8df155b3d98cc`.
The builder checked that the rebuilt entry is identical to the save. The browser runs produced the same bytes; both boots use the first patch with no rebuild in between.

| Boot | Consumption | Observation | Close |
|---|---|---|---|
| editor-test-1789503985200-c0276b1d | FileMonitor 15 333 kB, original 15 241 kB | Third sunflower on the islet, original pair preserved, Sonic Boom recognised and moved right/left | Normal, PID 34500, forced=false |
| editor-test-1789504260678-b4ece022 | Same archive, FileMonitor 15 333 kB | Same copy visible, Sonic Boom walks onto the bridge then comes back | Normal, PID 9180, forced=false |

Captures examined: suffixes `46-tutorial-skylander`, `49-tutorial-moved-right`, `52-tutorial-moved-left` in `.local/dolphin-evidence/`; report `.local/object-workflow/game-proof.json`. The recipe explains the change to the other users of the weed model; they were not all inspected visually at a distance. No collision/script/import success is inferred from this test. M4A/M4B/M5 stay UNKNOWN.

## User's editor

Server refreshed on port 7400 outside the sandbox that caused spawn EPERM. Session `s_d58eb87d`, 0 applied operations and **44 Redo operations** preserved; every state rebuilt and compared with the plan's bytes before the old server was stopped. Save SHA256 `45be5ecdffaee44309feff64fd2ba82dc36043af81ddcb25f5244a9a19ea88fe`, patch and dirty state preserved. The duplication test uses a separate session. Refreshing the page loads the browser panel.

## Next

T001–T009 finished. Extension of 2026-09-16: T014/T015/T017 finished for the tutorial, with two identical direct entries and the modified patch re-read after restoring (`tutorial-direct-current-patch-two-runs-20260916`). Details in ../005-native-object-addition/validation.md. T010–T013 and T016 stay in the backlog. The old note recommending a state already inside Mining has been corrected: such a state can restore assets from before the patch.
