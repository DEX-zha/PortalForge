# Unity-inspired interface — 2026-09-15

## Fixes after use

The interface is now entirely in English: navigation, categories, inspector, help, confirmations, statuses and launch errors. Names and paths that come from the game data stay unchanged. The descriptions below report the first version of the layout.

- [x] UI06 Press-and-hold drop: pointerdown/move/up with pointer capture on the Project pane, a 5 px threshold and a preview at the cursor position. Releasing inside the canvas prepares the replacement; Escape, loss of capture/focus and abandoning outside the scene cancel with no edit. A plain click keeps the selection. The HTML5 path stays compatible, but the mouse gesture no longer depends on the host window triggering it.
- [x] UI07 Add **Reset scene** to the scene bar, with confirmation. Restore the state as it was when opened by replaying the exact undos of the transforms and replacements; keep Redo, clear the selection, restore the initial visibility and re-frame the level. Detach the save and the patch from the session so an old result cannot be relaunched, without deleting any file. Refuse during an operation or a Dolphin launch.
- [x] UI08 Translate every interface text into English, including tooltips, accessibility, folders and server errors. **Copy** cards accept the drop; **View only** exposes the refusal reason in a tooltip and in the status bar on click. The **Copyable** filter isolates the eligible sources.
- [x] UI09 Check the gesture with the browser's native mouse events, from the name and from the thumbnail, two distinct destinations, Escape and abandoning outside the scene. Check cancelling the reset, an exact reset after copy + move + save, preservation of the saved file and recovery of both edits through Redo. Refresh the server while keeping the user's history.

Validation: **250/250 SSA tests and 6/6 MCP tests PASS**. Full Edge/WebGL scenario with CDP mouse input, with no synthetic DragEvent, passed; a drop at two distinct positions, the replacement confirmations unchanged, and an exact reset and Redo. Layout checked at 1280×800 and the English wording reviewed. Local report and captures: `.local/object-workflow/browser-1789509022615/` (`reset-confirmation.png`, `reset-complete.png`). Command: `node tools/ssa-archive/tests/browser-catalog.mjs --no-patch`; drop the option to build the patch as well.

The HTML5 path worked in an isolated Edge with a complete mouse sequence; a single cause across every host window is not established. The new handler supports the described gesture directly. It does not make scripted/inactive objects copyable when their duplication is still unconfirmed: the tutorial's 48 copyable sources and the replacement rules stay identical. No archive recipe was modified and no new in-game test is claimed. Server refreshed with verified preservation of session `s_d58eb87d`, of its save, of its patch and of its 44 Redo steps.

Request: simplify the editor as a whole, with the browser at the bottom, folders/categories and sub-folders, names then 3D previews.

## Specification

- A compact main bar for the transform tools, undo, save, patch and launch.
- Placement hierarchy on the left; layers reachable in a separate tab. Scene in the centre and inspector on the right, properties before the launch settings.
- Project panel at the bottom: a tree of categories/sub-categories, breadcrumbs, search and filters, a card grid with the name above the 3D preview. A category is a navigation classification derived from the names/models, not an engine parent nor a folder written to disc.
- Thumbnails produced from the meshes actually decoded, with automatic framing and a per-model cache; missing geometry is reported explicitly. One shared renderer, progressive generation of the visible cards, no WebGL context per card.
- Adjustable panel height and thumbnail size, with local preferences. Selection consistent between hierarchy, scene and Project. The drag and drop and the confirmations of batch 1 are preserved.
- No change to the game data or to the patch recipe. No server restart and no history rebuild required.

Layout reference: [Unity — Project window, two-column view](https://docs.unity.cn/Manual/ProjectView.html). The names stay above the previews, as requested.

## Plan and tasks

- [x] UI01 Reorganise index.html and add workspace.css / workspace.mjs: panels, tabs and resizing.
- [x] UI02 Add pure classification in asset-folders.mjs and the grid/tree in catalog.mjs.
- [x] UI03 Produce the local thumbnails in thumbnails.mjs; lazy loading, cache and missing geometry.
- [x] UI04 Connect the selections and preserve the drop, undo/redo, settings and history.
- [x] UI05 Check the tree, the real previews, resizing, search, the drop and the absence of mutation in the user's session; update the report.
- [x] UI10 Remove the button nested inside the folder `summary` elements; use the native title and check selection/collapsing with Space and Enter. Edge scenario PASS in `.local/object-workflow/browser-1789509766825`: no nested interactive control, no browser error. The drop under test is still a replacement; real addition is tracked in spec 005.

## Acceptance

In the tutorial the 673 placements stay reachable; opening Vegetation then Flowers filters correctly with no edit. A sunflower has a non-empty thumbnail under its name. Selecting from the hierarchy or from the scene updates the inspector and the cards. The bottom panel resizes without a zero-sized canvas; the controls stay reachable at 1280×800. Drop then undo/redo pass the existing browser scenario. The patch bytes do not change because of the rework.

## Validation carried out

- SSA suite: **248/248 tests PASS**, including the new folder-partition tests and the existing inspector tests.
- Edge/WebGL browser: 673 objects and 673 hierarchy entries; the Vegetation/Flowers sub-folder = 21 placements; the sunflower thumbnail loaded under the name; selection synchronised; tabs, Project height and top bar checked at 1280×800. Search measured at 4.2 ms.
- Full drop scenario: victim choice, critical rules, confirmation, a new operation available, exact undo/redo and model reloading. No browser exception. The scenario used an isolated copy and prepared its patch, without starting Dolphin. The patch recipes were not modified by this interface work.
- Captures inspected: `.local/object-workflow/browser-1789507926510/workspace-sunflower.png` and `workspace-1280.png`. Report in that folder; those captures stay local.
- Open session preserved, checked by `.local/object-workflow/check-live.mjs`: same identifier, save, patch, 0 applied edits and 44 Redo steps. No server restart needed; refreshing the page loads the new files.

The thumbnails are grey previews of geometry that is already decoded: they do not claim to reproduce materials, animations or script-driven assemblies. The categories may be imperfect for unknown names, which stay reachable under Others and through search.
