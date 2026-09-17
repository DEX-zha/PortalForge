# Tasks — object workflow

> Scope reviewed 2026-09-17: this feature records its original design and evidence. Later extensions and
> remaining work are mapped in the [specification status](../README.md); historical limits below are not the
> current editor limits.

Initial scope: T001–T009 (US1). Extension explicitly requested on 2026-09-16: US3 prioritised for the tutorial, together with T023–T027 of 005. T010–T013 (import) and T016 (other levels) stay in the backlog.

Evolution requested afterwards: [interface rework](interface.md), UI01–UI05 done and validated (Project pane at the bottom, categories, 3D thumbnails, simplified inspector).

Further requests: UI06–UI09 finished in [interface.md](interface.md): drop with pointer capture, reversible Reset scene and an entirely English interface. Validation: 250 SSA tests, 6 MCP tests and a real Edge mouse scenario with reset/Redo. US2/US3 remain the backlog below.

## Preparation

- [x] T001 Document the three steps in specs/004-object-workflow/{spec,plan,research,data-model,quickstart}.md and contracts/editor-workflow.md; check the gates and the checklist.

## US1 — Browser and drop

- [x] T002 [US1] Add tests for the catalogue, a transaction without mutation, acknowledgements, staleness, locking and exact undo/redo in tools/ssa-archive/tests/editor-catalog.test.mjs (FR001–008, SC001–002).
- [x] T003 [US1] Implement tools/ssa-archive/src/editor/catalog.mjs and the server.mjs routes; fix planReplace in session.mjs (FR001/005–008).
- [x] T004 [US1] Implement search, categories, selection and confirmation in tools/ssa-archive/src/view/catalog.mjs and index.html (FR001–003/005–008).
- [x] T005 [US1] Add intersection and drop preview in tools/ssa-archive/src/view/scene.mjs; cancellation and fallback plane (FR004).
- [x] T006 [US1] Integrate the rebuild after replace/undo/redo and the locking in tools/ssa-archive/src/view/app.mjs / src/editor/session.mjs; keep the local geometry in src/editor/meshes.mjs and check tests/editor-meshes.test.mjs (FR009–010).
- [x] T007 [US1] Pass the SSA/MCP suites and the real browser scenario; record it in specs/004-object-workflow/validation.md (SC001–002).
- [x] T008 [US1] Check the same patch across two Dolphin boots with consumption and rendering observed; evidence in .local/ and a report in specs/004-object-workflow/validation.md (SC003).
- [x] T009 [US1] Preserve then refresh the user's editor and finalise docs/editor/roadmap.md / the tasks (FR015/SC006).

## US2 — Cross-level import, future

- [x] T010 [US2] Delivered by 007 P01–P04 in `src/editor/game-catalogue.mjs`: read-only foreign kinds and per-level provenance (FR011). Dependency closure/import remains T011/T013.
- [ ] T011 [US2] Dependency and compatibility report in src/editor/import-plan.mjs, with no new writer (FR012).
- [ ] T012 [US2] Explicit reuse of a model present in the target, through a local instance and a confirmed recipe; tests and two boots (FR012).
- [ ] T013 [US2] Research the closure/remapping of an absent decoration, M4A evidence before any writer; collision M4B and behaviour M5 separate, source findings in docs/findings/records (SC004).

## US3 — Direct entry, tutorial delivered; other levels future

- [x] T014 [US3] Inventory the transitions before loading and the level/state/game/runtime/configuration identities in src/editor/level-entry.mjs (FR013–014).
- [x] T015 [US3] Tutorial protocol with no old RAM bytes, two arrivals and a new patch visible; evidence in .local/ (SC005, tutorial part).
- [ ] T016 [US3] Mining redirect is CONFIRMED (006); Undead Volcano and Challenge 005 have addition runs (007). Finish the per-level entry matrix/review for other families; no automatic promotion or silent fallback (FR013/SC005).
- [x] T017 [US3] Expose only proven strategies in the editor and invalidate the caches; tests for the incompatibilities (FR014). Tutorial only; see docs/level-entry-status.json. T016 stays independent.

## Dependencies and strategy

T001 → T002 → T003 → T004/T005 → T006 → T007 → T008 → T009. T004 and T005 touch distinct files but are integrated before validation. MVP = the whole of US1. US2: T010 → T011 → T012, with T013 subject to the gates. US3: T014 → T015 → T016 → T017. The evidence for the future batches is independent; no PASS status is inferred from an interface or from a boot alone.
