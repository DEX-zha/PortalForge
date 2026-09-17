# Plan — object workflow

> Scope reviewed 2026-09-17: this feature records its original design and evidence. Later extensions and
> remaining work are mapped in the [specification status](../README.md); historical limits below are not the
> current editor limits.

2026-09-15. [Spec](spec.md). Three batches documented initially, US1 delivered. Extension requested on 2026-09-16: US3 prioritised for the tutorial, evidence and integration in specs/005-native-object-addition. Import and access to the other levels are still to be done.

## Context and gates

Node.js ESM, local HTTP, Three.js and DOM without a bundler. node:test tests, a WebGL browser and a dedicated Dolphin. No package added; evidence in .local/. M0–M3 PASS; M4A/M4B/M5 UNKNOWN. US1 uses only the confirmed same-size replacements, with the slot chosen explicitly. No new geometry, collision or script writer.

## Architecture and sequence

1. Specify, document research/contracts and generate the tasks.
2. Tests in tools/ssa-archive/tests/editor-catalog.test.mjs before implementation.
3. src/editor/catalog.mjs: a catalogue separate from placement-v1, an immutable preparation tied to a revision, confirmation through applyEdit. src/editor/server.mjs exposes the routes; session.mjs returns the plans without a critical rule and reports the rebuilds that are needed.
4. src/view/catalog.mjs: filter, selection and drop. scene.mjs: visible intersection or adjustable horizontal plane, with a ghost keeping orientation/scale. index.html: panel and explicit confirmation of the victim. app.mjs reloads placements and meshes after replace/undo/redo while preserving camera/layers.
5. Local suites, browser, two identical boots with proof of consumption and a visual result. Preserve the user's session when restarting.
6. Future US2: external catalogue, diagnostic, local reuse, then M4A/M4B/M5 import research.
7. US3: entry before loading, proof of identity and of consumption, per-level matrix. The tutorial uses a checkpoint without native codes, prepared on the current virtual disc, with an identical FST, then re-reads the patch after resuming. See docs/editor/direct-entry.md and docs/level-entry-status.json.

Fix that came out of the visual check: src/editor/meshes.mjs keeps a library of the level's meshes from before the replacement. Renamed model paths use the corresponding original local geometry; an ambiguous association stays a proxy. Tests in tests/editor-meshes.test.mjs, including the other users of a shared model and undo/redo. Reproducible browser scenario in tests/browser-catalog.mjs.

## Validation

No byte before confirmation; refusal for scripted/inactive sources, missing runtime map, stale plan or locked session; one exact undo/redo edit. Compare the rebuilt entry with the saved one. Dolphin: FileMonitor or RAM, visible copy, victim and shared effects explained, working game. The future batches have their own gates; documenting them is not delivering them.
