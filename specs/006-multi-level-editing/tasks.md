# Tasks: Multi-level editing

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

- [ ] T012 Two identical cold boots of an edited non-tutorial level through normal play (SC-004). Promotes the
      finding to CONFIRMED. Waits for the user's go-ahead; not started.
- [x] T013 Roadmap rewritten (`docs/editor/roadmap.md`), AGENTS.md and README updated, validation.md written;
      suites, lint and formatting clean; pull request opened.

## Dependencies

T001 → T002/T003 → T004/T005 → T006/T007 → T008/T009; T010 and T011 depend only on T001; T012 depends on T005;
T013 closes.
