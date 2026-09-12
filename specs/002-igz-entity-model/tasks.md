---

description: "Task list for IGZ v5 Level Object Model and Entity Duplication"
---

# Tasks: IGZ v5 Level Object Model and Entity Duplication

**Input**: Design documents from `/specs/002-igz-entity-model/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md); feature 001 complete (M0, M1, M2 PASS).

**Tests**: included (constitution principle V and feature-001 practice): synthetic IGZ fixtures without game data, fixture tests skipped without `.local/samples`, in-game experiments as integration evidence.

**Organization**: by user story. US1 object graph, US2 entity fields, US3 duplication (gate M3).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Create `tools/ssa-archive/src/igz/` and `tools/ssa-archive/tests/helpers/synthetic-igz.mjs` per plan.md; no new dependency in `tools/ssa-archive/package.json`
- [X] T002 [P] Add the `igz` command group and `experiment m3` placeholders to `tools/ssa-archive/cli.mjs` and `src/cli-commands.mjs` with the exit codes of contracts/igz-cli.md
- [X] T003 [P] Copy the fan-research scope sentence into `tools/ssa-archive/src/igz/README.md` and link `docs/findings/igz-objects.md`

---

## Phase 2: Foundational

- [X] T004 Implement `tools/ssa-archive/src/igz/header.mjs`: magic `0x49475A01`, version 5, section table `{offset, size, align, tag}` zero-terminated, section-0 second header words; failures `BAD_IGZ_MAGIC`, `UNSUPPORTED_IGZ_VERSION`, `SECTION_OVERLAP`, `SECTION_END_MISMATCH`
- [X] T005 [P] Implement `tools/ssa-archive/src/igz/types.mjs`: NUL-terminated names from 0x834 to the 4-aligned end (empty names kept), per-type u32 size hints with `size_confidence: "UNKNOWN"` (research.md R2)
- [X] T006 Implement `tools/ssa-archive/src/igz/objects.mjs`: enumerate `{type < types.length, 1, 0x01xxxxxx}` headers in the object section, bound each object by the next header or section end, emit `unparsed` regions for uncovered bytes (research.md R1)
- [X] T007 Implement `tools/ssa-archive/src/igz/refs.mjs`: string references as `section2 + v` with `0 = null` (research.md R3), object references when a plain word lands on an object header, flagged references `0x8xxxxxxx` kept with low 24 bits (research.md R4)
- [X] T008 Implement `tools/ssa-archive/src/igz/graph.mjs`: assemble the ObjectGraph, compute `accounting` with `objects + unparsed + padding == total`, validate against `contracts/object-graph.schema.json`, export JSON
- [X] T009 [P] Write `tests/helpers/synthetic-igz.mjs`: build a v5 file with header, 3 sections, type table with an empty name, size table, objects with string and object references, one unparsed inline array
- [X] T010 [P] Write `tests/igz-graph.test.mjs` and `tests/igz-refs.test.mjs`: accounting equals total, unparsed region reported, string ref resolution with null 0, object and flagged references, header failures
- [X] T011 Wire `igz sections|types|objects|show` into `src/cli-commands.mjs` with the JSON shapes of contracts/igz-cli.md

**Checkpoint**: object graph of any decoded IGZ v5 with explicit unparsed regions

---

## Phase 3: User Story 1 - Read the object graph (P1)

- [X] T012 [P] [US1] Write `tests/igz-fixtures.test.mjs`: skip without samples; on the tutorial `level.bld` assert 9 sections ending at the file size, 224 types, accounting equals total, and that the object at 0x1A76EC is `tfbPhysicsModel` with f32be (91.73, 10.31, 44.74) at +0x94
- [X] T013 [US1] Correlate `size_hint[type]` with measured object distances per type over the tutorial graph in `src/igz/types.mjs`; promote `size_confidence` to LIKELY only where at least 90 % of instances agree; record the finding `igz.section0.type-size-table` accordingly
- [X] T014 [US1] Run `igz objects --out` on the tutorial and two Challenge levels (quickstart Scenario 1); record accounting results in `docs/findings/records/igz.object-graph.accounting.json`
- [ ] T015 [US1] Decode the section-1 header and the 2 866-entry list (research.md R4) in `src/igz/refs.mjs`; document the flagged-pointer meaning as a finding (LIKELY or UNKNOWN) with the tested hypotheses

**Checkpoint**: SC-001 satisfied or the residual unparsed regions are named

---

## Phase 4: User Story 2 - Entity records and transforms (P2)

- [X] T016 [P] [US2] Implement `src/igz/entities.mjs`: candidate position fields (f32be triples, world scale), dimension filter (multiples of 1.524), min/max pair detection, per-type field statistics
- [X] T017 [P] [US2] Implement `src/igz/match.mjs`: RAM address or pattern to `(object, field)` using the section base `0x80DBC020` (configurable) and the graph; wire `igz near|match`
- [ ] T018 [US2] Locate Hugo: run `ram-diff`/`live-probe` during a dialogue where Hugo walks (or use his static position from the intro), match to the graph, record a finding UNKNOWN then LIKELY with two observations
- [ ] T019 [US2] Screen and confirm three entity fields other than the spawn with `experiment m2 --repeat 1 --skip-control` then `--repeat 2`, judge each, promote or contradict findings (`docs/findings/world-entities.md`)
- [ ] T020 [US2] Record every negative result in `docs/experiments/README.md` with its failing stage

**Checkpoint**: SC-002 or the documented reason it is not reached

---

## Phase 5: User Story 3 - Duplication, gate M3 (P3)

- [X] T021 [P] [US3] Write `tests/iga-chunk-growth.test.mjs`: re-encoding an entry into more chunks grows the u16 table area, updates header words 0x08 and 0x24 and relays all entries; the archive stays VALID and decodes identically
- [X] T022 [US3] Extend `src/iga/decode.mjs` and `src/iga/writer.mjs` to support chunk-count growth for a replaced entry (remove `REENCODE_CHUNK_COUNT_CHANGED` for growth), keeping byte-preserving behaviour otherwise
- [X] T023 [P] [US3] Write `tests/igz-clone.test.mjs`: cloning a synthetic object appends the record, updates the object count and list, assigns a unique id, updates section offsets, and the graph re-validates
- [X] T024 [US3] Implement `src/igz/clone.mjs` producing a DuplicationPlan (`contracts/duplication-plan.schema.json`), refusing non-CONFIRMED findings, validating the rebuilt decoded file with the graph
- [X] T025 [US3] Wire `igz clone` into `src/cli-commands.mjs`
- [X] T026 [US3] Implement `src/experiments/m3-duplicate.mjs` on the `m2-mutation.mjs` pattern with `inputs.duplication`, control + `--repeat` runs, judged by `experiment m2-judge`
- [X] T027 [US3] Run the M3 experiment on the CONFIRMED `tfbPhysicsModel` record (clone with +X), judge both runs, write `docs/m3-status.json` (PASS, or FAIL/UNKNOWN naming the blocking unknown)

**Checkpoint**: M3 decided on evidence

---

## Phase 6: Polish

- [X] T028 [P] Update `README.md`, `AGENTS.md`, `docs/experiments/README.md` and `tools/ssa-archive/README.md` with the `igz` commands and the M3 status
- [ ] T029 Run the quickstart scenarios end to end and fix mismatches
- [X] T030 [P] Confirm no game data outside `.local/` and that the scope statement is intact (SC-005)

---

## Dependencies

- Phase 2 blocks all stories; US1 → US2 (entity fields need the graph) → US3 (duplication needs CONFIRMED fields and chunk growth).
- T021/T022 (chunk growth) can start after Phase 2, in parallel with US2.

## Implementation Strategy

MVP = US1 (object graph with accounting). US2 adds confirmed knowledge one field at a time, each with a 5 min screening run before a 10 min formal run. US3 is attempted only with a CONFIRMED record and a VALID plan; a documented FAIL is a legitimate outcome that names what blocks structural editing.

---

## Phase 7: Convergence

Question driving this phase: why does the engine not instantiate a valid appended IGZ object, and which structure turns a record into a live gameplay object (M3 blocking unknown, `docs/m3-status.json`).

- [ ] T031 Build a reverse-reference index and `igz refs <decoded file> <offset>` in `tools/ssa-archive/src/igz/refs.mjs` and `src/cli-commands.mjs`: for a target object, find every word in every section whose value resolves to it under each pointer convention (object-section-relative, absolute, flagged low 24 bits, other-section-relative) and list referrer objects with field offsets; apply it to the spawn record 0x1A76EC and record the owner chain as findings per FR-003 / research R4 (partial)
- [ ] T032 Decode container objects in `tools/ssa-archive/src/igz/containers.mjs` (igObjectList, igNodeList, igNonRefCountedNodeList, igNonRefCountedAttrList, AbstractPlacementList, ActorWaypointList, ScriptSet lists): count, capacity, data pointer, element stride and members; expose `igz containers` and `igz members <offset>`; identify the container(s) holding the spawn record per FR-003 and the US3 edge cases (missing)
- [ ] T033 Add `experiment ptr-scan` in `tools/ssa-archive/src/experiments/live-probe.mjs`: from state slot 6 with the figure loaded, scan MEM1/MEM2 for big-endian pointers equal to 0x80DBC020 + 0x1A76EC (and to the clone address in a patched run), map hits back to file objects with `igz match`, and record the runtime owners as findings per FR-004 / research R6 (missing)
- [ ] T034 Extend `tools/ssa-archive/src/igz/clone.mjs` to register the clone in the container that owns the source (bump the count when capacity allows, otherwise relocate the element array and fix its pointer), update parent references found by T031, and re-validate the graph per FR-006 / US3 acceptance scenario 1 (partial)
- [ ] T035 Rerun M3 with the registered clone (`experiment m3`, screening run then two formal runs), judge with `experiment m2-judge`, update `docs/m3-status.json` and `docs/experiments/README.md` per FR-007 / US3 acceptance scenario 2 (missing)
- [ ] T036 If T035 still shows an inert clone, test the parent hypothesis: clone the referrer entity found by T031 together with its child references (leaf record as component), run twice, record PASS or the new blocking unknown per US3 acceptance scenario 3 and the identifier-scheme edge case (missing)
- [ ] T037 Annotate `igz show` fields in `tools/ssa-archive/src/cli-commands.mjs` with the finding id, name and confidence when `docs/findings/records` describes that object type and field offset (the CONFIRMED spawn position at +0x94) per US1 acceptance scenario 2 (partial)
- [ ] T038 Study the 0x01xxxxxx object ids in `tools/ssa-archive/research-probes/probe-igz-ids.mjs`: uniqueness and ordering across the tutorial and two Challenge levels, and whether ids appear as reference values elsewhere; record a finding per FR-003 and the identifier edge case (missing)
- [ ] T039 Correlate the per-type u32 table with measured object sizes across three levels in `tools/ssa-archive/src/igz/types.mjs` and update finding `igz.section0.type-size-table` per SC-001 quality (partial)