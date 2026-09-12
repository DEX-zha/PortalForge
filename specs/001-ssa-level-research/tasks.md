---

description: "Task list for SSA Level Research"
---

# Tasks: SSA Level Research

**Input**: Design documents from `/specs/001-ssa-level-research/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Test tasks ARE included. The specification requires them: FR-005/FR-006 demand structural validation with reported failures, SC-003 demands 100 % byte-difference classification, and the source description mandates `Read(Write(Read(x))) = Read(x)` parser tests. Synthetic tests never contain game data (FR-017).

**Organization**: Tasks are grouped by user story. US0 is already complete (M0 PASS, 2026-09-12); its tasks are checked and kept for traceability.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US0, US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single Node.js package per [plan.md](plan.md): library and CLI in `tools/ssa-archive/`, tests in `tools/ssa-archive/tests/`, existing MCP reused from `tools/dolphin-mcp/`. Game-derived data stays in `.local/` (git-ignored); human findings in `docs/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the toolkit package next to the existing MCP

- [X] T001 Create the package tree `tools/ssa-archive/{src/{iga,disc,workspace,patch,research,experiments},tests,research-probes}` per the Source Code layout in plan.md
- [X] T002 Create `tools/ssa-archive/package.json`: `"private": true`, `"type": "module"`, `"engines": {"node": ">=22"}`, scripts `test` = `node --test tests/*.test.mjs`, `m1`, `m2`, and dependency `ajv` 8.20.0 pinned to the version already used by `tools/dolphin-mcp`
- [X] T003 [P] Add `tools/ssa-archive/README.md` stating the gate rule from FR-015: no editor, viewport, import or object-creation code in this package until M1 and M2 are PASS
- [X] T004 [P] Verify `.gitignore` at the repository root still excludes `.local/`, `node_modules/`, `*.wbfs`, `*.iso`, `*.rvz`, `*.sky`, and add `tools/ssa-archive/node_modules/` if not already covered

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Disc access, IGA v4 reading, workspace and validation. Every user story reads archives, so nothing below can be deferred.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Implement `tools/ssa-archive/src/disc/identify.mjs`: run `DolphinTool.exe header -i <wbfs>` and return `SourceGameCopy` fields `path, game_id, region, revision, internal_name`; mark `supported` only when `game_id === "SSPP52"` (FR-001, data-model.md SourceGameCopy)
- [X] T006 [P] Implement `tools/ssa-archive/src/disc/extract.mjs`: wrappers for `DolphinTool.exe extract -i <wbfs> -g -l` (listing) and `-s <disc path> -o <dir>` (single file); open the dump read-only and never write to it (FR-002, FR-017)
- [X] T007 Implement `tools/ssa-archive/src/iga/header.mjs` decode for IGA v4 little-endian: `magic` must equal `0x1A414749`, `version` must equal 4, and the 12 header words at 0x00-0x2C are preserved verbatim as `header_words` including the UNKNOWN words 0x10, 0x14, 0x20, 0x24, 0x28, 0x2C (data-model.md ArchiveHeader, research.md R2)
- [X] T008 Implement hash-table decode in `tools/ssa-archive/src/iga/header.mjs`: read `u32[count]` at 0x30 into `hashes`; the rule is "strictly ascending" and a violation reports `HASHES_NOT_SORTED` (data-model.md ArchiveHeader)
- [X] T009 Implement entry-table decode in `tools/ssa-archive/src/iga/reader.mjs`: `{u32 start, u32 size, u32 mode}[count]` starting at `0x30 + 4*count`; derive `compression` as `NONE` for high byte `0xFF` and `LZMA_CHUNKED` for high byte `0x10`, any other high byte reports `UNSUPPORTED_MODE`; derive `chunk_table_index` as `mode & 0xFFFFFF` when compressed, `null` otherwise (data-model.md Entry)
- [X] T010 Implement name-table decode in `tools/ssa-archive/src/iga/reader.mjs`: `u32[count]` offsets at `name_table_offset`, each pointing to a NUL-terminated string; names must be unique within the archive and `name_table_offset + name_table_size` must equal the archive size (data-model.md ArchiveHeader, Entry)
- [X] T011 Implement `stored_size` and `data_sha256` computation per entry in `tools/ssa-archive/src/iga/reader.mjs`: stored bytes run from `start` to the next entry start or `name_table_offset`, whichever is lower (data-model.md Entry)
- [X] T012 Implement `tools/ssa-archive/src/iga/chunks.mjs` read side: locate the `u16[]` chunk tables that follow the entry table, store `{offset, values}` verbatim with `confidence: "UNKNOWN"` and `decoded: null`; do not guess the semantics (data-model.md ChunkTable, research.md R2)
- [X] T013 Implement `tools/ssa-archive/src/iga/verify.mjs` with every failure reason from contracts/ssa-archive-cli.md: `BAD_MAGIC`, `UNSUPPORTED_VERSION`, `COUNT_MISMATCH`, `HASHES_NOT_SORTED`, `MISALIGNED_ENTRY` (`start % 0x800 == 0`), `ENTRY_OVERLAP`, `ENTRY_OUT_OF_BOUNDS` (`start + stored_size <= name_table_offset`), `NAME_TABLE_BOUNDS`, `NAME_OFFSET_OUT_OF_RANGE`, `UNSUPPORTED_MODE`, `CHUNK_TABLE_OUT_OF_RANGE`, `WORKSPACE_ENTRY_HASH_MISMATCH`; each failure carries `offset, field, actual, expected, reason` (FR-006)
- [X] T014 Implement `tools/ssa-archive/src/workspace/manifest.mjs`: write and read `manifest.json` validated against `specs/001-ssa-level-research/contracts/workspace-manifest.schema.json` with Ajv; enforce `header_words` `minItems: 12, maxItems: 12`, entry `start` `multipleOf: 2048`, `compression` enum `["NONE", "LZMA_CHUNKED"]`, and `data_sha256` pattern `^[0-9a-f]{64}$`
- [X] T015 Implement archive extraction to a workspace in `tools/ssa-archive/src/workspace/manifest.mjs`: write stored entry bytes to `entries/<index>-<basename>` and record `file`, `replaced: false`, `decoded_file: null` (FR-004)
- [X] T016 Create `tools/ssa-archive/cli.mjs` skeleton with command dispatch, `--json` flag, and the exit codes from contracts/ssa-archive-cli.md: 0 success, 1 validation/experiment failure, 2 unsupported input, 3 usage or I/O error
- [X] T017 Wire the read-only commands in `tools/ssa-archive/cli.mjs`: `identify`, `disc-list`, `disc-extract`, `info`, `list`, `extract`, `verify`, with the exact JSON shapes given in contracts/ssa-archive-cli.md
- [X] T018 [P] Implement `tools/ssa-archive/tests/helpers/synthetic.mjs`: build valid IGA v4 archives in memory (configurable entry count, names, 0x800 alignment) plus corrupted variants for each verify failure reason; contains no game data (FR-017)
- [X] T019 [P] Write `tools/ssa-archive/tests/iga-synthetic.test.mjs`: parse synthetic archives and assert header words, hashes, entry fields, names and `stored_size`; assert `Read(x)` is stable across repeated parses
- [X] T020 [P] Write `tools/ssa-archive/tests/verify.test.mjs`: assert each corrupted synthetic archive yields its expected `reason` with correct `offset`, `actual` and `expected`, and that a valid archive yields `status: "VALID"` with an empty `failures` array

**Checkpoint**: Archives can be identified, read, extracted and validated; user story work can begin

---

## Phase 3: User Story 0 - Establish the Dolphin MCP prerequisite (Priority: P0) ✅ COMPLETE

**Goal**: An operational local Dolphin MCP before archive-toolkit development

**Independent Test**: Connect an MCP client, launch the SSA dump in the dedicated profile, identify the game, send Wii Remote/Nunchuk input, capture a frame and logs, save and restore a state, then repeat the launch through a Riivolution descriptor

- [X] T021 [US0] Install the Felk `scripting-preview4` runtime, bridge and 35-tool MCP server in `tools/dolphin-mcp/` and register it with Codex (evidence: `docs/dolphin-mcp.md`)
- [X] T022 [US0] Validate launch, memory, Wii/Nunchuk input with observed release, Portal figure recognition, native state save/load in gameplay, pause/resume and clean stop (evidence: `.local/dolphin-evidence/live-test.json`, `calls.jsonl`, captures)
- [X] T023 [US0] Prove Riivolution file replacement at engine level and record the gate in `docs/m0-status.json`: control boot serves `hbm/config.txt` at `0 kB`, patched boot at `61 kB` (evidence: `.local/dolphin-evidence/m0-proof.json`, `tools/dolphin-mcp/m0-proof.mjs`)

**Checkpoint**: M0 PASS — SSA toolkit implementation is unblocked (FR-018, SC-008)

---

## Phase 4: User Story 1 - Prove archive round-trip (Priority: P1) 🎯 MVP

**Goal**: Extract an original archive, rebuild it without intentional content changes, replace it through the patch workspace, and enter the corresponding level in game

**Independent Test**: Run `node cli.mjs experiment m1 --archive level/Level_027_Tutorial.arc` and `--archive level/Level_027_Tutorial.bld`; both records must be `status: "PASS"` with `crash_or_load_error: false` in every run and the tutorial reachable with its assets loaded

### Tests for User Story 1 ⚠️

> Write these tests FIRST and ensure they FAIL before implementation

- [X] T024 [P] [US1] Write `tools/ssa-archive/tests/roundtrip-synthetic.test.mjs`: assert `rebuild(extract(archive))` is byte-identical for synthetic uncompressed archives and that `Read(Write(Read(x)))` equals `Read(x)` structurally
- [X] T025 [P] [US1] Write `tools/ssa-archive/tests/diff.test.mjs`: assert `DiffReport` classifies each injected difference as `METADATA`, `TABLE`, `CONTENT` or `PADDING` and that `unclassified_bytes` is 0 for every synthetic case (SC-003)
- [X] T026 [P] [US1] Write `tools/ssa-archive/tests/patch-workspace.test.mjs`: assert the generated descriptor contains only forward-slash paths, the XML carries `<id game="SSP" developer="52"><region type="P"/>` with `resize="true"`, and only differing files appear in `replacements[]` (FR-009, research.md R9)
- [X] T027 [P] [US1] Write `tools/ssa-archive/tests/iga-fixtures.test.mjs`: skip with an explicit message when `.local/samples` is absent; otherwise assert the CONFIRMED rows of research.md R2 on `Level_027_Tutorial.arc` (477 entries, all mode `0xFFFFFFFF`, hashes ascending, every `start % 0x800 === 0`) and a byte-identical `.arc` round-trip

### Implementation for User Story 1

- [X] T028 [US1] Implement `tools/ssa-archive/src/iga/writer.mjs` with `strategy: "BYTE_PRESERVING"`: emit header words, hash table, entry table, chunk tables, entries at their original offsets and the name table, copying every unknown header word verbatim from the manifest (research.md R6)
- [X] T029 [US1] Implement `tools/ssa-archive/src/iga/diff.mjs`: produce `regions[] {offset, length, old_hex, new_hex, class}`, `size_delta` and `unclassified_bytes`, classifying by offset range against the parsed layout (FR-007)
- [X] T030 [US1] Wire `rebuild` and `diff` into `tools/ssa-archive/cli.mjs`: `rebuild` runs `verify` then `diff` on its output and exits 1 when the result is INVALID or `unclassified_bytes > 0`
- [X] T031 [US1] Extract the M1a fixtures with `node cli.mjs disc-extract` into `.local/samples/DATA/files/level/` for `Level_027_Tutorial.arc` and `Level_027_Tutorial.bld`, then run T027 and record the fixture results
- [X] T032 [US1] Evaluate and pin the LZMA codec per research.md R7 in `tools/ssa-archive/package.json`: try `lzma-purejs` first and `lzma1` as fallback; acceptance is decoding every chunk of `.local/samples/DATA/files/character/001_Gryphon.bld` and re-encoding to a stream that decodes identically
- [X] T033 [US1] Implement chunk decode in `tools/ssa-archive/src/iga/chunks.mjs`: 0x8000-byte chunks, 5-byte LZMA properties header validated as first byte `0x5D` with a dictionary size not exceeding the chunk size, chunk sizes as `u16` for version 4, chunks aligned to 0x800; set `confidence: "CONFIRMED"` on a chunk table only once its values are proven by a successful full-entry decode (research.md R3)
- [X] T034 [US1] Resolve the UNKNOWN header words in `tools/ssa-archive/src/iga/header.mjs` by correlating word 0x10 bit patterns, word 0x24 and word 0x28 with entry counts, chunk counts and modes across all 153 `level/` archives; record each resolved field in `docs/iga-v4.md` with Offset, Type, Endian, Meaning, Evidence, Confidence (research.md R2)
- [X] T035 [US1] Add `--decode` support to `extract` in `tools/ssa-archive/cli.mjs`: write `decoded_file` only when chunk semantics are CONFIRMED, otherwise report `decoded: false` with the reason rather than guessing
- [X] T036 [US1] Implement `tools/ssa-archive/src/patch/riivolution.mjs`: generate the Riivolution XML and the game-mod descriptor by importing `buildDescriptor` from `tools/dolphin-mcp/runtime.mjs` so descriptor paths keep forward slashes, and compute `expected_monitor_sizes` per replaced disc path (data-model.md PatchWorkspace)
- [X] T037 [US1] Wire the `patch` command into `tools/ssa-archive/cli.mjs` writing `.local/patches/<experiment-id>/` with `riivolution/<id>.xml`, `launch.json` and `patch.json`
- [X] T038 [US1] Record the tutorial entry input script to `tools/ssa-archive/src/experiments/input-scripts/level-027-entry.json`: the MCP `dolphin_hold_wii_input` sequence from boot to the playable tutorial scene, replayable and stored as data
- [X] T039 [US1] Implement `tools/ssa-archive/src/experiments/m1-roundtrip.mjs` following the `tools/dolphin-mcp/m0-proof.mjs` pattern: control boot, patched boot, consumption proof, figure load, input-script level entry, screenshots, logs, clean stop; wait with `dolphin_frame_advance` in chunks of at most 120 frames (plan.md Constraints, research.md R10)
- [X] T040 [US1] Add consumption proof for a byte-identical rebuild in `tools/ssa-archive/src/experiments/m1-roundtrip.mjs`: use a deliberately padded copy for the file-monitor size check and the real rebuild for the gameplay run, per quickstart.md Scenario 3; never treat a successful boot as proof (AGENTS.md)
- [X] T041 [US1] Write the experiment record to `.local/dolphin-evidence/experiments/<id>.json` validated against `contracts/experiment-record.schema.json`: `kind: "M1_ROUNDTRIP"`, `status` in `["PASS", "FAIL", "UNKNOWN"]`, `runs` `minItems: 1`, and `failing_stage` naming the failing stage on FAIL (FR-008, acceptance scenario 3)
- [X] T042 [US1] Wire `experiment m1` into `tools/ssa-archive/cli.mjs`: exit 1 on FAIL and exit 2 when `docs/m0-status.json` is not PASS
- [X] T043 [US1] Run M1a on `level/Level_027_Tutorial.arc` and M1b on `level/Level_027_Tutorial.bld`, including the chunk-preserving rebuild and then a decode/re-encode round-trip of one `.bld` entry (plan.md Gate sequencing)
- [X] T044 [US1] Record the gate in `docs/m1-status.json` with `name: "M1"`, `status`, `prerequisites: ["M0"]`, non-empty `evidence[]` listing both experiment ids, and `validated_on`; update `docs/iga-v4.md` and `specs/001-ssa-level-research/checklists/requirements.md` (data-model.md ValidationGate, SC-002)

**Checkpoint**: M1 is decided on evidence. If PASS, US2 may start; if FAIL, the record names the failing stage and format research continues (spec.md edge case)

---

## Phase 5: User Story 2 - Prove a controlled world change (Priority: P2)

**Goal**: Change one identified world value and observe the predicted in-game result, twice

**Independent Test**: Run `node cli.mjs experiment m2 ... --repeat 2`; both runs must show the predicted effect in `observed_effect` and the record must be `status: "PASS"`

**Depends on**: US1 PASS (a rebuilt archive must load before a mutated one is meaningful)

### Tests for User Story 2 ⚠️

- [X] T045 [P] [US2] Write `tools/ssa-archive/tests/scan-floats.test.mjs`: assert the scanner finds planted `f32` scalars and 2/3/4/16-value groups in both byte orders within a requested range and reports `offset, endian, values[], score` (FR-010)
- [X] T046 [P] [US2] Write `tools/ssa-archive/tests/mutation.test.mjs`: assert `rebuild --replace` changes only the targeted bytes, that `diff` reports exactly one `CONTENT` region, and that `strategy` becomes `"REENCODE_REPLACED"` when the mutated entry was compressed

### Implementation for User Story 2

- [X] T047 [P] [US2] Implement `tools/ssa-archive/src/research/scan-floats.mjs` per FR-010: scalars and vectors of 2, 3, 4 or 16 values, `--endian le|be|both`, `--range min max`, plausibility scoring
- [X] T048 [P] [US2] Implement `tools/ssa-archive/src/research/bindiff.mjs`: report `offset`, old value, new value, size delta and context bytes, distinguishing header, table, content and padding regions (source description section 25)
- [X] T049 [P] [US2] Add `scan floats`, `scan strings` and `bindiff` to `tools/ssa-archive/cli.mjs` with the output rows defined in contracts/ssa-archive-cli.md
- [X] T050 [US2] Decode the nested `level.bld` of `level/Level_027_Tutorial.bld` and of two `level/Challenge_Level_*.bld` into `.local/workspaces/`, then run `scan strings` to catalogue `.igz` object type names and record them in `docs/findings/igz-objects.md` (research.md R5)
- [X] T051 [US2] Run the comparative analysis from research.md R11 step 2 with `bindiff` and `scan floats --vector 3` over the decoded level data; record each candidate position triple as a finding with `confidence: "UNKNOWN"` and `editable: false` in `docs/findings/transforms.md`
- [X] T052 [US2] Validate candidates live through the MCP before touching any archive: read the value with `dolphin_read_float`, write a changed value with `dolphin_write_float`, observe with `dolphin_screenshot`, and promote a candidate to `confidence: "LIKELY"` only with at least two independent concordant observations (research.md R11, data-model.md ResearchFinding transitions)
- [X] T053 [US2] Implement mutation support in `tools/ssa-archive/src/iga/writer.mjs`: `--replace <index>=<file>` re-encodes only the replaced entry and only when re-encoding is proven to decode identically, setting `replaced: true` in the manifest and `strategy: "REENCODE_REPLACED"`
- [X] T054 [US2] Implement `tools/ssa-archive/src/experiments/m2-mutation.mjs`: apply one value change of type `f32le|f32be|u32le|u32be|u16le|u16be|u8`, rebuild, patch, and run `--repeat` times reusing a state saved at level entry to shorten the loop (research.md R10)
- [X] T055 [US2] Record `inputs.mutation` per `contracts/experiment-record.schema.json` with required fields `entry_index, offset, type, old_hex, new_hex, predicted_effect` where `predicted_effect` has `minLength: 1`, plus the referenced `finding_id` (FR-011)
- [X] T056 [US2] Enforce the M2 PASS rule in `tools/ssa-archive/src/experiments/m2-mutation.mjs`: `status: "PASS"` only when every run has `crash_or_load_error: false` and `observed_effect` matches the prediction in both runs; a non-deterministic result leaves the finding unconfirmed and not exposed as editable (FR-012, SC-004, acceptance scenario 3)
- [X] T057 [US2] Wire `experiment m2` into `tools/ssa-archive/cli.mjs` with exit 1 unless every run matches, then run it twice on the selected candidate
- [ ] T058 [US2] Record the gate in `docs/m2-status.json` and promote the proven finding to `confidence: "CONFIRMED"` with `editable: true` in `docs/findings/transforms.md`, which the schema permits only when confidence is CONFIRMED

**Checkpoint**: M1 and M2 both decided. Editor work becomes permissible only if both are PASS (FR-015, SC-006)

---

## Phase 6: User Story 3 - Preserve reproducible research evidence (Priority: P3)

**Goal**: Every archive and level finding carries evidence, confidence and reproducible inputs

**Independent Test**: Pick any recorded finding and reproduce its experiment from the documented original input, mutation, patch output and observed result

- [X] T059 [P] [US3] Implement `tools/ssa-archive/src/research/findings.mjs`: read, write and Ajv-validate finding records against `contracts/finding-record.schema.json`, enforcing `id` pattern `^[a-z0-9][a-z0-9.-]*$`, `endian` enum `["le", "be", "n/a", "unknown"]`, `confidence` enum `["CONFIRMED", "LIKELY", "UNKNOWN"]`, `editable: true` only when confidence is CONFIRMED, and `evidence` `minItems: 1` for LIKELY and CONFIRMED (FR-013)
- [X] T060 [P] [US3] Implement the finding state machine in `tools/ssa-archive/src/research/findings.mjs`: UNKNOWN to LIKELY with two independent concordant observations, LIKELY to CONFIRMED only via an Experiment with `status: "PASS"` referencing the finding, and any contradicting experiment returns it to UNKNOWN with the contradiction recorded (data-model.md ResearchFinding)
- [X] T061 [P] [US3] Implement `tools/ssa-archive/src/research/categories.mjs` keeping separate evidence records for world entities, visible geometry, collisions, gameplay logic and inter-resource references (FR-014)
- [X] T062 [US3] Add `findings list|show|validate` and `gates` to `tools/ssa-archive/cli.mjs`; `gates` prints `docs/m*-status.json` as a table and `--json` returns the `ValidationGate` array (contracts/ssa-archive-cli.md)
- [X] T063 [US3] Add a guard in `tools/ssa-archive/cli.mjs` so no command prints a finding as an editable property unless `editable: true`; cover it with `tools/ssa-archive/tests/findings.test.mjs` (FR-013, SC-005)
- [X] T064 [P] [US3] Create `docs/findings/README.md` documenting the record format Offset, Type, Endian, Meaning, Evidence, Confidence and the rule that an unproven finding is published as a hypothesis, never as confirmed behaviour (acceptance scenario 3)
- [X] T065 [P] [US3] Write `docs/experiments/README.md` explaining how to reproduce any experiment from its JSON record: original dump identity, workspace, mutation, patch output and observed result
- [X] T066 [US3] Generate `docs/iga-v4.md` from the finding records so the container documentation and the machine-readable findings cannot drift apart

**Checkpoint**: Findings and gates are traceable, labelled and reproducible

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T067 [P] Update `README.md` and `AGENTS.md` with the toolkit entry point, the `ssa-archive` commands and the current gate statuses
- [X] T068 [P] Move the Phase 0 probes `tools/ssa-archive/research-probes/probe-iga-header.mjs` and `probe-iga-contents.mjs` into regression fixtures or delete them once `src/iga/reader.mjs` covers their assertions
- [X] T069 Run the full `quickstart.md` scenario list end to end and fix any command whose output does not match its documented shape
- [X] T070 [P] Check the performance targets from plan.md: parse and verify a 53 MB level `.arc` in under 5 s, byte-preserving rebuild under 30 s, one experiment cycle under 3 min
- [X] T071 [P] Confirm no game data reached the repository: no `.wbfs`, `.arc`, `.bld`, `.igz`, `.sky`, save, memory dump or captured game image outside `.local/` (FR-017)
- [X] T072 Run `$speckit-constitution` to fill `.specify/memory/constitution.md`, which is still the unfilled template, with the six project invariants listed in the Constitution Check of `specs/001-ssa-level-research/plan.md`
- [X] T073 Update `specs/001-ssa-level-research/checklists/requirements.md` with the M1 and M2 outcomes and their evidence ids

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup; BLOCKS US1, US2 and US3
- **US0 (Phase 3)**: Already complete; it gates everything else (FR-018) and required no Phase 2 work because it lives in `tools/dolphin-mcp/`
- **US1 (Phase 4)**: Depends on Phase 2 and on US0 PASS
- **US2 (Phase 5)**: Depends on US1 PASS, unlike a typical story; a mutation proof is meaningless until an unmutated rebuild loads
- **US3 (Phase 6)**: Depends on Phase 2 only; its schemas and guards can be built in parallel with US1, and it consumes US1/US2 records as they appear
- **Polish (Phase 7)**: Depends on the desired stories being complete

### Within Each User Story

- Tests are written before implementation and must fail first
- Reader before writer; writer before patch; patch before experiment driver
- A gate status file is written only after its experiment records exist

### Parallel Opportunities

- Setup: T003 and T004 together
- Foundational: T006 alongside T007; the test trio T018, T019, T020 together once the reader exists
- US1 tests T024, T025, T026, T027 together before any Phase 4 implementation
- US2 research utilities T047, T048, T049 together
- US3 is the main cross-story parallel track: T059, T060, T061, T064, T065 can proceed while US1 runs

---

## Parallel Example: User Story 1

```bash
# Launch all US1 tests together, before implementation:
Task: "Write tools/ssa-archive/tests/roundtrip-synthetic.test.mjs"
Task: "Write tools/ssa-archive/tests/diff.test.mjs"
Task: "Write tools/ssa-archive/tests/patch-workspace.test.mjs"
Task: "Write tools/ssa-archive/tests/iga-fixtures.test.mjs"

# Then the independent implementation modules:
Task: "Implement tools/ssa-archive/src/iga/writer.mjs"
Task: "Implement tools/ssa-archive/src/iga/diff.mjs"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup
2. Phase 2 Foundational (blocks everything)
3. Phase 4 US1 through T044
4. **STOP and VALIDATE**: both M1 experiment records PASS, tutorial reachable, diff fully classified
5. The MVP is the M1 decision itself, not a feature: a documented FAIL with its failing stage is a valid outcome that redirects the project to format research (spec.md, source description section 40)

### Incremental Delivery

1. Setup + Foundational: archives can be read, extracted and validated
2. US1: M1 decided, patch workflow proven
3. US2: M2 decided, one CONFIRMED world property
4. US3: evidence base consolidated (can run alongside US1 and US2)
5. Editor work stays out of scope until M1 and M2 are both PASS

### Stop Conditions

Reconsider the project if M1 remains impossible after the container is fully understood, if essential level data turns out to be code-generated rather than editable data, or if a complete serializer exceeds the project's objective. An isolated crash or one unknown structure is not sufficient to conclude impossibility.

---

## Notes

- [P] tasks touch different files and have no incomplete dependencies
- Every task names an exact file path so it can be executed without further context
- Never infer readiness from a tool listing, a process launch, a scheduled action, a successful boot of a Riivolution descriptor, or an empty screenshot (AGENTS.md)
- The original WBFS and the user's Dolphin 2606a installation are never modified
- Commit after each task or logical group; stop at any checkpoint to validate a story independently
