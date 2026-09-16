# Tasks: Real addition

## Phase 1 — Setup

- [x] T001 Specify the real-addition choice and its criteria in specs/005-native-object-addition/spec.md, plan.md and checklists/requirements.md.
- [x] T002 Fix the folder summaries in tools/ssa-archive/src/view/catalog.mjs and workspace.css; test Space/Enter in tests/browser-catalog.mjs.

## Phase 2 — Foundational research

- [x] T003 Audit the M3 limits and inventory the clones in .local/object-workflow/addition-audit.mjs; record the limits in research.md.
- [x] T004 Identify the native handler and its parameters from the MEM1 dumps in .local/native-addition/; document the provenance and the confidence in research.md.
- [x] T005 Instrument a control clone call through the dedicated Dolphin, with bounded traces in .local/native-addition/; demonstrate that the observed context is the cloning one.
- [x] T006 Demonstrate a clean exploratory creation, then a persistent patch representation over 2 boots; record the results in docs/findings/records/ without enabling any unconfirmed property.

## Phase 3 — US1 Add in game

- [x] T007 [US1] After T006, write the tests for creation without a victim and for preserving the originals in tools/ssa-archive/tests/editor-addition.test.mjs.
- [x] T008 [US1] Implement the confirmed recipe and its save/export in tools/ssa-archive/src/editor/, following contracts/addition.md.
- [x] T009 [US1] Connect the drop to the confirmed additions in tools/ssa-archive/src/view/catalog.mjs and scene.mjs; refuse unknown sources in English.
- [x] T010 [US1] Run the drop → patch → 2 boots path; record the evidence in .local/native-addition/ and quickstart.md.

## Phase 4 — US2 History

- [x] T011 [US2] Add identity, selection and transformation of the additions in src/editor/session.mjs and src/view/app.mjs; tests that they are not confused with the source.
- [x] T012 [US2] Check exact Undo/Redo/Reset and restoration after saving in tests/editor-addition.test.mjs and tests/browser-catalog.mjs.

## Phase 5 — Validation

- [x] T013 Run the SSA/MCP suites and complete specs/005-native-object-addition/validation.md with the actual results and limits.

## Dependencies and parallelisation

T001 → T003 → T004 → T005 → T006 → T007..T010 → T011..T013. T002 is independent of the engine research. Reading the dumps (T004, research agent) and studying the instrumentation (preparing T005, main agent) can progress together with no shared writes. MVP = US1 proven in game; no false delivery in the form of a local copy alone.

Result: the first scope is finished, with evidence and limits in [validation.md](validation.md). The other sources and capabilities stay out of scope, with no implicit activation.

## Extension: compatibility and validation by families

- [x] T014 Define the diagnostics/families and test the candidate, blocked, technical and confirmed distinctions.
- [x] T015 Add the compatibility analysis to the catalogue and to the inspector, with English counters/filters and persistent results.
- [x] T016 Implement a bounded reproducible campaign: source groups, boot, per-instance checks, captures, cancellation and profile restoration; do not modify the user's scene.
- [x] T017 Run the campaign on 1_Coper, Barrel and Chompy; record the observations and open only the confirmed scope. At that stage Barrel was opened; 1_Coper/Chompy were still under lifecycle diagnosis. Their later validation is covered by T019–T022.
- [x] T018 Check the suites and the interface, preserve the open session, document how to know about and test a capability. See compatibility.md and validation.md.

## Priority: copying enemies and loot

- [x] T019 Compare existing sources and clones: identifiers, parameters, shared scripts, state and activation context; record the lifecycle from the tutorial's entry onwards.
- [x] T020 Isolate the cause through control experiments (position, context, parameters/identity where justified), keeping the scripts and the originals.
- [x] T021 Implement the supported fix and confirm the new sources over two identical boots with visibility and distinct instances; do not confuse creation with gameplay validation.
- [x] T022 Check the save/patch/interface and the regressions, update the findings, the specs and the effective limits.

## Wider editing and direct launch — 2026-09-16

- [x] T023 Study and prove an entry before the tutorial loads, compatible with a new archive and new native codes; keep the negative evidence.
- [x] T024 Integrate the direct launch into the launcher and the interface, with asset identity, consumption after the transition, cancellation and profile restoration.
- [x] T025 Test the capacity of eight mixed additions in the reserved memory, check the actors' independence, history, save and patch; publish only after two runs and a visual check.
- [x] T026 Extend the catalogue to extra sources that are genuinely proven, with reusable diagnostics and no automatic promotion by family.
- [x] T027 Validate the suites, the browser runs, the observed performance and the user's scene; refresh the specs, findings, guides and limits. 280 SSA tests, 6 MCP, two browser runs, two identical resumes and a production preparation with eight additions; session preserved and server refreshed.

## Optional opening cinematic

- [x] T028 Identify and observe the native command that skips the tutorial's opening, without restoring a loaded level.
- [x] T029 Add the remembered English choice in Playtest settings, its API validation/transmission and the macro branch; keep the no-skip branch exactly as it was.
- [x] T030 Check the option on/off, the compatible modes, the browser run and Dolphin with additions; document the evidence and preserve the open session. Two Dolphin runs with eight additions, 283 SSA tests, 6 MCP, choice remembered/transmitted by the browser, the user's eight additions and patch preserved.
