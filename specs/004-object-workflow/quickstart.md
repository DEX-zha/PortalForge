# Verification

1. In Objects, search for a plant then click to reveal and frame it.
2. Drag an available source onto the scene. Check the ghost, the coordinates and the adjustable fallback altitude. Escape, or a drop outside the scene, cancels.
3. Choose the object to replace; read the plan and acknowledge every critical rule. No edit before confirmation.
4. Confirm: the source is preserved, the copy is dropped, one edit. Undo/redo restore every affected model.
5. Test the refusals for scripted/inactive sources, missing runtime map, stale plan and locking. Those objects stay selectable.
6. Save/patch in an isolated space, compare the rebuilt bytes; two identical boots with FileMonitor/RAM consumption, a visual result and playability. Evidence in .local/.

npm test in tools/ssa-archive and tools/dolphin-mcp. Dedicated browser, user session preserved. Batches 2/3: [research](research.md). A state created inside the loaded level does not automatically reload the modified assets.

Reproducible WebGL check from the root: `node tools/ssa-archive/tests/browser-catalog.mjs`. Prerequisites: Windows with Edge, the Tutorial sample under `.local/workspaces/tutorial-bld/entries/3-level.bld.decoded`, the map `.local/dolphin-evidence/ptr-scan3-fixups.json`, the original archive extracted and the usual Dolphin configuration. The script opens an isolated session, uses the HTML5 drop events, checks the bytes and prepares a patch; it does not start Dolphin. Results and captures in `.local/object-workflow/browser-*/`, the latest report in `.local/object-workflow/latest-browser.json`.

To use the delivered batch: refresh `http://127.0.0.1:7400/`, search for a **Copiable** source, drag it into the scene, choose the victim and confirm the plan. The drop copies the object; it does not create an extra slot.
