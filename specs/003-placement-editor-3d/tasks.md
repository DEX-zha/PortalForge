---

description: "Task list for the 3D placement editor"
---

# Tasks: 3D placement editor

**Input**: Design documents from `/specs/003-placement-editor-3d/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/editor-api.md, quickstart.md

**Tests**: included. The constitution requires that tests are written before the implementation they cover, so
every phase writes its tests first and they must fail before the implementation task starts.

**Organization**: grouped by user story so each one can be implemented, tested and demonstrated on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: the user story the task serves (US1, US2, US3, US4)
- Paths are relative to the repository root

## Path Conventions

The editor lives inside the existing toolkit package, `tools/ssa-archive/`. Node-side modules go under `src/`,
the browser view under `src/view/`, tests under `tests/`. No new package and no build step.

**Boot budget**: two tasks cost two emulator boots each, T041 and T053. They are marked and no other task boots.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: bring in the one new dependency and create the files the later phases fill.

- [X] T001 Add `three` as a pinned dependency in `tools/ssa-archive/package.json`, install it, and confirm it resolves from `tools/ssa-archive/node_modules/three` with no network access at run time (research R2)
- [X] T002 [P] Create the browser view skeleton as empty ES modules with a header comment each: `tools/ssa-archive/src/view/index.html`, `app.mjs`, `scene.mjs`, `select.mjs`, `layers.mjs`, `inspector.mjs`, `coords.mjs`
- [X] T003 [P] Create the editor process skeleton as empty ES modules with a header comment each: `tools/ssa-archive/src/editor/session.mjs`, `save.mjs`, `server.mjs`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the session, the transport and the coordinate mapping. No user story can start before this phase is
done, because every story reads a session over the contract.

**⚠️ CRITICAL**: no user story work begins until this phase is complete.

- [X] T004 [P] Write the failing session tests in `tools/ssa-archive/tests/editor-session.test.mjs`: opening refuses when the gate files do not report M1 and M2 as PASS, refuses when no placement class is detected, refuses when any resolved record fails `specs/002-igz-entity-model/contracts/placement-v1.schema.json`, and on success exposes `id`, `file`, `archive`, `entry`, `original_sha256`, `placements`, `layers`, `detection`, `has_runtime_map`, `edits` empty and `dirty` false
- [X] T005 [P] Write the failing transport tests in `tools/ssa-archive/tests/editor-server.test.mjs`: the server binds `127.0.0.1` only, serves `index.html`, serves the modules under `src/view/`, serves `three` from `node_modules`, and returns 404 for any path outside those two directories including traversal attempts
- [X] T006 [P] Write the failing coordinate tests in `tools/ssa-archive/tests/view-coords.test.mjs`: the mapping is a single exported function, it is its own inverse when applied twice, and flipping the documented handedness flag changes exactly one horizontal axis
- [X] T007 Implement `openSession` in `tools/ssa-archive/src/editor/session.mjs` using the existing `resolveAll` and the frozen schema, with the refusals from T004; every refusal names the file and the reason and returns no session (data-model EditorSession, FR-006, FR-010)
- [X] T008 Implement the coordinate mapping in `tools/ssa-archive/src/view/coords.mjs` as the single place any axis convention is written, with the handedness flag documented in the file header (research R7)
- [X] T009 Implement the `node:http` server and the static routes in `tools/ssa-archive/src/editor/server.mjs`, serving only `src/view/` and `node_modules/three`, refusing every other path (contract `GET /` and `GET /view/*`)
- [X] T010 Wire `edit serve <level.bld.decoded> --archive --entry [--fixups] [--port] [--open]` in `tools/ssa-archive/src/cli-commands.mjs` and declare its options in `tools/ssa-archive/cli.mjs`, printing the session id and the view URL and exiting 2 with a named reason on refusal (contract, command line)

**Checkpoint**: a level can be opened, refused for the right reasons, and a page can be served. No API yet.

---

## Phase 3: User Story 1 — See a level and inspect what an object really is (Priority: P1) 🎯 MVP

**Goal**: open a level, see one box per placement grouped by layer, fly the camera, click an object and read
every attribute of the frozen record with the evidence that produced it.

**Independent Test**: open the tutorial, confirm the count and the layer list against `docs/placement-corpus-v1.json`,
select the windmill blades and confirm the inspector matches what that report states for `0x324C44`.

### Tests for User Story 1

- [X] T011 [P] [US1] Write the failing contract tests for `GET /api/session`, `GET /api/placements` and `GET /api/placement/:offset` in `tools/ssa-archive/tests/editor-api-read.test.mjs`: every element of `placements` validates against the frozen placement schema with `evidence` present, `layers` carries `name`, `count` and a per-severity `grades` object, and `GET /api/placement/:offset` returns `placement`, `safety` and `replace_targets`
- [X] T012 [P] [US1] Write the failing layer-visibility tests in `tools/ssa-archive/tests/view-layers.test.mjs`: a placement is visible while at least one of its layers is visible, a placement with no layer belongs to the synthetic group `(unlayered)`, and hiding every layer never makes a placement unreachable (data-model LayerView)
- [X] T013 [P] [US1] Write the failing selection tests in `tools/ssa-archive/tests/view-select.test.mjs`: a click selects the nearest hit, a second click at the same pointer position advances to the next hit, the list wraps around, and moving the pointer resets the cycle (research R4, FR-004)

### Implementation for User Story 1

- [X] T014 [US1] Implement `GET /api/session` and `GET /api/placements` in `tools/ssa-archive/src/editor/server.mjs`, returning the shapes in `contracts/editor-api.md` and answering 500 with the offending offset rather than a partial record when one fails the schema (FR-007, FR-010)
- [X] T015 [US1] Derive `LayerView` in `tools/ssa-archive/src/editor/session.mjs`: `name`, `count`, and `grades` counting placements per safety severity, plus the synthetic `(unlayered)` group (data-model LayerView)
- [X] T016 [US1] Implement `GET /api/placement/:offset` in `tools/ssa-archive/src/editor/server.mjs`, attaching the rules from `src/editor/safety.mjs` and the same-span duplication targets (FR-016, FR-020)
- [X] T017 [P] [US1] Implement the layer visibility model in `tools/ssa-archive/src/view/layers.mjs` as pure functions over the placement list, satisfying T012 (FR-002)
- [X] T018 [P] [US1] Implement hit ordering and cycling in `tools/ssa-archive/src/view/select.mjs` as pure functions over a hit list, satisfying T013 (FR-004)
- [X] T019 [US1] Implement the scene in `tools/ssa-archive/src/view/scene.mjs`: one instanced mesh for every placement, per-instance colour from the worst safety severity, a box for a placement that resolves a model and a smaller wireframe octahedron for one that does not, scale taken from the record divided by 100 (research R3 and R6, FR-001, FR-003)
- [X] T020 [US1] Implement the free camera in `tools/ssa-archive/src/view/scene.mjs`: orbit, pan, zoom, plus a command that frames the whole level and one that frames the selection (FR-005)
- [X] T021 [US1] Implement the inspector in `tools/ssa-archive/src/view/inspector.mjs`: name, position, rotation heading, scale, model path and status, behaviour script, layers, shared-model user count and owning placement, and next to each attribute the value of `evidence` for it, distinguishing runtime-confirmed from structural (FR-007, FR-008, FR-009)
- [X] T022 [US1] Display the safety rules of the selected object in `tools/ssa-archive/src/view/inspector.mjs`, each with its severity and the finding behind it, marking a scripted placement with the warning that such an object has been observed both to survive and to break a level when moved (FR-016, FR-019)
- [X] T023 [US1] Wire the view together in `tools/ssa-archive/src/view/app.mjs` and `index.html`: fetch the session, build the scene, render the layer list with per-layer visibility, route selection into the inspector, and show a named message instead of an empty scene when the file carries no placements (FR-006)
- [X] T024 [US1] Run quickstart scenario 2 against `.local/dolphin-evidence/m3-level_027_tutorial-e3-1789301970935-run1-46-tutorial-skylander.png` and record the outcome in `specs/003-placement-editor-3d/research.md` under R7: either the mapping is confirmed, or one horizontal axis is negated in `tools/ssa-archive/src/view/coords.mjs` and the note says so. No boot; the screenshot already exists

**Checkpoint**: the editor is a working level viewer, writes nothing, and its spatial claims are verified.

---

## Phase 4: User Story 2 — Move an object and see it move in the game (Priority: P2)

**Goal**: edit a transform with gizmos or numbers, save through the existing validation, build a replacement
patch and launch, with the outcome recorded as an experiment.

**Independent Test**: move one plant of the tutorial a visible distance, save, patch, launch, and compare the
screenshot with an unmodified run at the same point.

### Tests for User Story 2

- [ ] T025 [P] [US2] Write the failing edit tests in `tools/ssa-archive/tests/editor-session.test.mjs`: a transform intent updates the in-memory placement and sets `dirty`, undo and redo restore the previous states and `undo_depth`, a new edit clears the redo stack, and an intent on an attribute whose `evidence` is `none` is refused with `EVIDENCE_MISSING` (data-model EditIntent, FR-013, FR-014)
- [ ] T026 [P] [US2] Write the failing save tests in `tools/ssa-archive/tests/editor-save.test.mjs`: a valid save reports `file_length_unchanged` true and `bytes_changed_outside` zero and writes the file, an invalid plan writes nothing and returns every failure, and a save whose opened file hash no longer matches is refused (data-model SavePlan, FR-021, FR-022)
- [ ] T027 [P] [US2] Write the failing patch and launch tests in `tools/ssa-archive/tests/editor-save.test.mjs`: patching without a valid save is refused with `NOTHING_SAVED`, patching while the session lock is held is refused with `SESSION_LOCKED`, launching without a non-empty prediction is refused with `PREDICTION_REQUIRED`, and recording an observation releases the lock (data-model SessionLock and LaunchRecord, FR-024, FR-025, FR-026)

### Implementation for User Story 2

- [ ] T028 [US2] Implement intent application, undo and redo in `tools/ssa-archive/src/editor/session.mjs`, delegating the byte work to `setTransform` in `src/editor/placements.mjs` and never touching the buffer directly (data-model EditIntent, FR-011, FR-014)
- [ ] T029 [US2] Implement `POST /api/edit`, `POST /api/undo` and `POST /api/redo` in `tools/ssa-archive/src/editor/server.mjs`, returning the updated placement, its safety rules, `dirty` and `undo_depth`, and answering 409 with the rule that caused a refusal (contract)
- [ ] T030 [US2] Implement `POST /api/save` in `tools/ssa-archive/src/editor/save.mjs`: produce the plan before writing, check it against the bytes actually written, and write only when the plan is `VALID` (FR-021, FR-022)
- [ ] T031 [US2] Implement `POST /api/patch` in `tools/ssa-archive/src/editor/save.mjs` by calling the existing patch workspace builder with a single replacement, refusing while the session lock is held (FR-023, FR-026)
- [ ] T032 [US2] Implement `POST /api/launch` in `tools/ssa-archive/src/editor/save.mjs` by calling the existing experiment runner, requiring a non-empty prediction, and taking the session lock for the run (FR-024)
- [ ] T033 [US2] Implement `POST /api/observe` in `tools/ssa-archive/src/editor/save.mjs`, storing the observation and the judgement in the experiment record and releasing the lock (FR-025)
- [ ] T034 [P] [US2] Implement the move gizmo in `tools/ssa-archive/src/view/scene.mjs` with three axes, updating the inspector position continuously while dragging (FR-011, FR-012)
- [ ] T035 [P] [US2] Implement the rotate gizmo in `tools/ssa-archive/src/view/scene.mjs` as a single ring around the vertical axis writing the heading field, and the scale gizmo as a uniform handle writing the single scale value shown as a percentage (research R5, FR-012)
- [ ] T036 [US2] Add numeric entry for position, heading and scale in `tools/ssa-archive/src/view/inspector.mjs`, sharing the validation path with the gizmos so both produce the same intent (FR-011)
- [ ] T037 [US2] Show unsaved state in `tools/ssa-archive/src/view/app.mjs`: which objects have pending edits, the undo depth, and a save control that is disabled while nothing is dirty (FR-015)
- [ ] T038 [US2] Implement the save, patch, launch and observe flow in `tools/ssa-archive/src/view/app.mjs`, refusing to offer the launch control until a prediction has been typed and displaying the plan failures when a save is refused (FR-022, FR-024)
- [ ] T039 [US2] Run quickstart scenario 5 and record the byte comparison in `specs/003-placement-editor-3d/quickstart.md` notes: the only differing words are the transform fields of the edited placement (SC-004)
- [ ] T040 [US2] Run quickstart scenario 8 and confirm the session lock refuses a rebuild while a run is open, recording the outcome in `specs/003-placement-editor-3d/quickstart.md` notes (FR-026)
- [ ] T041 [US2] **Costs 2 boots.** Run quickstart scenario 6 on the tutorial: state the prediction, launch twice on the identical rebuilt archive, judge both runs, and index the two experiment records in `docs/experiments/README.md` (SC-007, SC-008)

**Checkpoint**: the full loop works on the tutorial and is demonstrated in game.

---

## Phase 5: User Story 3 — Duplicate an object without breaking the level (Priority: P3)

**Goal**: duplicate through the same-size replacement that is already boot-proven, with every consequence shown
before confirmation and blocking rules genuinely blocking.

**Independent Test**: duplicate a plant over another of the same size in the tutorial, confirm the shared model
record and its user count are shown before confirmation, save, launch and see the duplicate.

### Tests for User Story 3

- [ ] T042 [P] [US3] Write the failing duplication tests in `tools/ssa-archive/tests/editor-session.test.mjs`: `replace_targets` contains only placements whose span equals the source span, a replace intent triggering a critical rule is refused with `ACKNOWLEDGEMENT_REQUIRED` until that rule id appears in `acknowledged`, a replace triggering a blocking rule is refused with `PLAN_INVALID` and cannot be acknowledged at all, and a mismatched span is refused with `SPAN_MISMATCH` (data-model EditIntent and SafetyRuleView, FR-017, FR-018, FR-020)
- [ ] T043 [P] [US3] Write the failing duplication save test in `tools/ssa-archive/tests/editor-save.test.mjs`: after a replace, the written file differs from the original only inside the sacrificed slot and at the reference counts the plan declares (US3 acceptance scenario 5)

### Implementation for User Story 3

- [ ] T044 [US3] Implement replace intents in `tools/ssa-archive/src/editor/session.mjs`, delegating to `replacePlacement` in `src/editor/placements.mjs`, refusing an invalid plan, a span mismatch and an unacknowledged critical rule (FR-017, FR-018, FR-020)
- [ ] T045 [US3] Expose the same-span targets in `GET /api/placement/:offset` in `tools/ssa-archive/src/editor/server.mjs`, each with offset, name and span, and state how many exist (FR-020)
- [ ] T046 [US3] Implement the duplication flow in `tools/ssa-archive/src/view/inspector.mjs`: pick a source, pick a target from the offered list, and display the prepared plan with every triggered rule, its severity and its finding, before any confirmation is possible (FR-016)
- [ ] T047 [US3] Implement the acknowledgement step in `tools/ssa-archive/src/view/inspector.mjs`: a critical rule requires an explicit second confirmation that names the consequence, and a blocking rule offers no confirmation at all (FR-017, FR-018)
- [ ] T048 [US3] Display the shared-record consequences in `tools/ssa-archive/src/view/inspector.mjs` before confirmation: which records the copy rewrites, how many placements use each one, and the model name before and after (FR-009, finding `igz.placement.shared-model-record`)
- [ ] T049 [US3] Run quickstart scenario 4 and record the outcome in `specs/003-placement-editor-3d/quickstart.md` notes: the critical rule about the shared weed model is shown before confirmation is possible, and a mismatched-size target is refused outright (SC-005)

**Checkpoint**: duplication is available and cannot happen by accident.

---

## Phase 6: User Story 4 — Trust the editor on more than one level (Priority: P4)

**Goal**: the same loop on a level the editor has never opened, demonstrated in the running game.

**Independent Test**: open `Level_000_Mining`, move one object with a resolved model, save, launch, and judge the
result against the prediction stated before the boot.

### Tests for User Story 4

- [ ] T050 [P] [US4] Write the failing multi-level tests in `tools/ssa-archive/tests/editor-session.test.mjs`: a session opened without a fixup map reports `has_runtime_map` false and every pointer-derived attribute carries `structural` evidence rather than `runtime-pointer`, and the placement class is detected with no per-level configuration (FR-013, research R1 of feature 002)

### Implementation for User Story 4

- [ ] T051 [US4] Confirm the editor opens `.local/workspaces/mining-bld/entries/3-level.bld.decoded` with `--archive level/Level_000_Mining.bld --entry 3` and no fixup map, and fix whatever assumes the tutorial in `tools/ssa-archive/src/editor/session.mjs` (US4 acceptance scenario 1)
- [ ] T052 [US4] Make the absence of a runtime map visible in `tools/ssa-archive/src/view/inspector.mjs`, so that a structural value is never displayed the way a runtime-confirmed one is (Principle I, FR-008)
- [ ] T053 [US4] **Costs 2 boots.** Run quickstart scenario 7 on `Level_000_Mining`: state the prediction, launch twice on the identical rebuilt archive, judge, and index both experiment records in `docs/experiments/README.md` (SC-007)
- [ ] T054 [US4] Record the result as evidence in `docs/findings/records/igz.placement.type104-record.json`: a second level edited and booted promotes the placement layout from validated-on-paper to demonstrated on two levels, or, if it fails, the failure and what was seen instead are recorded and the editor is described as tutorial-specific

**Checkpoint**: the editor is no longer a tutorial-specific tool, or the record says plainly that it still is.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T055 [P] Write the editor section of `docs/igz-level-editing.md`: how to start it, what the view shows, what it refuses and why, with the boot evidence behind each refusal
- [ ] T056 [P] Add the editor commands to `tools/ssa-archive/README.md` and to the CLI usage banner in `tools/ssa-archive/cli.mjs`
- [ ] T057 Measure the open-to-visible time on the 673-placement tutorial and the frame rate while orbiting, and record both in `specs/003-placement-editor-3d/quickstart.md` notes; if the open exceeds five seconds, cache the resolved session rather than weakening the target (SC-001)
- [ ] T058 Run the regression block of `quickstart.md`: the whole `node --test` suite passes, `ssa-archive corpus` still validates every record against the frozen contract, and the boot-confirmed duplication still reproduces `sunflower-dup.decoded` byte for byte
- [ ] T059 Update `docs/experiments/README.md` and the gate notes in `docs/m3-status.json` with the editor runs, so the evidence trail for the editor sits with the rest

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: needs Setup; blocks every user story
- **User Story 1 (Phase 3)**: needs Foundational
- **User Story 2 (Phase 4)**: needs Foundational; reads the scene built in US1 for its gizmos, so in practice it follows US1
- **User Story 3 (Phase 5)**: needs Foundational and the save and patch flow of US2 to be demonstrable end to end
- **User Story 4 (Phase 6)**: needs US2, because it repeats that loop on another level
- **Polish (Phase 7)**: needs the stories that are being delivered

### Within Each User Story

- Tests are written first and must fail before the implementation task starts
- Session and endpoints before the view that consumes them
- Pure view modules (`layers.mjs`, `select.mjs`, `coords.mjs`) before the scene that uses them
- The boot tasks come last in their phase, because a boot is expensive and only worth spending on a finished flow

### Parallel Opportunities

- T002 and T003 in Setup
- T004, T005 and T006 in Foundational: three separate test files
- T011, T012 and T013 in US1, then T017 and T018 once their tests exist
- T034 and T035 in US2: separate gizmos, same file but disjoint sections; sequence them if that file becomes contended
- T042 and T043 in US3, T055 and T056 in Polish

---

## Parallel Example: User Story 1

```bash
# Write the three failing test files together:
Task: "Contract tests for the read endpoints in tools/ssa-archive/tests/editor-api-read.test.mjs"
Task: "Layer visibility tests in tools/ssa-archive/tests/view-layers.test.mjs"
Task: "Selection cycling tests in tools/ssa-archive/tests/view-select.test.mjs"

# Then the two pure view modules together:
Task: "Layer visibility model in tools/ssa-archive/src/view/layers.mjs"
Task: "Hit ordering and cycling in tools/ssa-archive/src/view/select.mjs"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 Setup
2. Phase 2 Foundational
3. Phase 3 User Story 1
4. **Stop and validate**: quickstart scenarios 1, 2 and 3. The tool writes nothing yet, so the risk is zero and
   the value is already real: a level becomes something a person can look at.

### Incremental delivery

1. Setup and Foundational
2. US1, validated by quickstart 1 to 3, no boot spent
3. US2, validated by quickstart 5 and 8, then 2 boots on quickstart 6
4. US3, validated by quickstart 4, reusing the loop US2 proved
5. US4, 2 boots on quickstart 7, which is what turns the editor from tutorial-specific into general

### Note on ordering

The spec allows the stories to be independent, and they are testable independently, but the honest sequence is
US1 → US2 → US3 → US4: each later story reuses the surface the earlier one built. Running them in parallel would
mean building the scene twice.

---

## Process debt

Recorded rather than repaired, because repairing it would mean deleting working code to write a test that fails on
purpose, and a test written after the fact does not become a test written before it by being re-run.

- **T014 and T016 were implemented before their tests (T011).** The read endpoints of the API were written as part
  of the server module in T009, so when the T011 contract tests were written they passed on the first run instead
  of failing first. The tests are real and they do constrain the endpoints: they check the frozen schema, the
  evidence fields, the layer grades and the same-size filter. What is missing is the demonstration that they would
  have caught the absence of that code. Every other test in this feature was written first and observed to fail.
- **The 3D rendering has no automated test at all**, by the plan's design rather than by omission. Everything
  decidable without a screen was pushed into pure modules and is covered: layer visibility, hit cycling, the axis
  derivation, and the inspector markup, which is checked against the real tutorial records in
  `tests/view-inspector.test.mjs`. What remains unverified is what a GPU draws, which is what quickstart
  scenarios 1 and 2 exist for.

---

## Notes

- [P] marks different files with no unfinished dependency
- Every task names the file it touches, so it can be executed without further context
- Tests are written before the implementation they cover, as the constitution requires
- The only tasks that boot the game are T041 and T053, two boots each, and both come at the end of their phase
- Commit after each task or logical group
