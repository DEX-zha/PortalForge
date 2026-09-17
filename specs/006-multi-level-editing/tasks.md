# Tasks: Multi-level editing

> Scope reviewed 2026-09-17: this feature records its original design and evidence. Later extensions and
> remaining work are mapped in the [specification status](../README.md); historical limits below are not the
> current editor limits.

**Input**: design documents from `/specs/006-multi-level-editing/`. Tests first, then the implementation they cover.
Paths are relative to the repository root. **Boot budget**: T012 costs two boots and is the only task that boots;
it runs only on the user's go-ahead.

## Phase 1 — Research

- [x] T001 Measure what the roadmap needs before designing it: the 76 decoded workspaces and their level entry, the
      open and mesh cost of the largest levels, the tutorial-only checks and their behaviour elsewhere. Record in
      research.md.

## Phase 2 — Catalogue and opening (US1)

- [x] T002 Tests for the catalogue on synthetic directories: families, keys, entries, runtime-map precedence,
      capabilities, lookup, empty machine — `tools/ssa-archive/tests/editor-level-catalog.test.mjs`.
- [x] T003 Implement `tools/ssa-archive/src/editor/level-catalog.mjs` and the `runtime_maps` setting in
      `tools/dolphin-mcp/config.mjs`.
- [x] T004 Tests for opening by name on a synthetic archive: unknown level, no game, first and second opening,
      runtime map, injected extractor, invalid archive, refused entry — `tests/editor-level-open.test.mjs`.
- [x] T005 Implement `tools/ssa-archive/src/editor/level-open.mjs`; `edit levels` and `edit open` in
      `src/cli/commands/edit.mjs`; usage; `editorDeps` no longer bound to one session.

## Phase 3 — Switching (US3)

- [x] T006 Tests for `GET /api/levels` and `POST /api/open` with every refusal — `tests/editor-open-route.test.mjs`.
- [x] T007 Implement the switchable session and the two routes in `src/editor/server.mjs`; `level` in the session
      summary.

## Phase 4 — View (US1, US3)

- [x] T008 Picker, Open, discard dialog, capability rows and parked tally in `src/view/index.html` and `app.mjs`.
- [x] T009 Real-browser scenario `tests/browser-multilevel.mjs`: 76 levels, capabilities, discard dialog,
      Mining → Challenge 005 → tutorial, zero exceptions. PASS `browser-1789648087080`.

## Phase 5 — Objects and terrain (US4)

- [x] T010 Headless previews with meshes of five non-tutorial levels; measure the extent inflation by parked
      objects on seven levels; add `levelExtent` with tests in `tests/view-framing.test.mjs`; use it in
      `scene.mjs`, `preview.mjs` and `meshes.mjs`.
- [x] T011 Finding `level.transform.other-levels` (LIKELY, not editable) with its evidence; render the findings.

## Phase 6 — Proof and delivery

- [x] T012 Two identical cold boots of an edited non-tutorial level (SC-004), done through the redirect as T018:
      `level.transform.other-levels` CONFIRMED on Mining.
- [x] T013 Roadmap rewritten (`docs/editor/roadmap.md`), AGENTS.md and README updated, validation.md written;
      suites, lint and formatting clean; pull request opened.

## Phase 7 — Patch lands in the chosen level (US5, added 2026-09-17)

- [x] T014 Tests for the archive redirect — `tests/editor-redirect.test.mjs`: voice pack in the catalogue and
      extracted on open, redirect macro, second descriptor with both tutorial names, launch selection and
      refusal, redirected run. Implement: `levels.mjs` (companion), `level-catalog.mjs`, `level-open.mjs`,
      `level-entry.mjs` (binding, `redirectSteps`), `patch-build.mjs`, `save.mjs` (`redirectFor`, launch),
      `dolphin-run.mjs`, `server.mjs` (`/api/level-entry`), the view's launch modes.
- [x] T015 Finding `level.entry.archive-redirect` (UNKNOWN), `docs/level-entry-status.json`, spec and roadmap
      updated.
- [x] T016 Two identical boots on Mining through the redirect (`editor-direct-test-1789649812643-1296e432`,
      `editor-direct-test-1789650170738-0c8c6b0a`): Mining loads where the tutorial would, consumption proven,
      finding CONFIRMED on Mining, other families LIKELY in the entry matrix.
- [x] T017 The **Level** tab next to Project (`src/view/levels.mjs`, `tests/view-levels.test.mjs`, the browser
      scenario): cards for the 76 levels with state, chips and Open; the current level with its files and
      capabilities.
- [x] T018 Two boots on Mining with the two opening-scene lanterns lowered by 5 units
      (`editor-direct-test-1789650694320-cf7db99e`, `editor-direct-test-1789650921032-81b4cf69`): the lantern
      leaves the top-left of the opening captures identically, judged by `shot diff`.

## Dependencies

T001 → T002/T003 → T004/T005 → T006/T007 → T008/T009; T010 and T011 depend only on T001; T012 depends on T005;
T014 depends on T005 and T007; T015 on T014; T016 on T014; T013 closes.
