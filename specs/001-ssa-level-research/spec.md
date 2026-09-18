# Feature Specification: SSA Level Research

> Scope reviewed 2026-09-17: this feature records its original design and evidence. Later extensions and
> remaining work are mapped in the [specification status](../README.md); historical limits below are not the
> current editor limits.

**Feature Branch**: `001-ssa-level-research`

**Created**: 2026-09-12

**Status**: Research toolkit implemented; M0–M3 PASS. This initial specification records the broader feasibility goal; M4A, M4B and M5 remain UNKNOWN.

**Input**: User description: "Build an SSA Research Toolkit that proves the feasibility of replacing and substantially modifying an existing Skylanders: Spyro’s Adventure Wii level without altering the original game image."

## User Scenarios & Testing *(mandatory)*

### User Story 0 - Establish the Dolphin MCP prerequisite (Priority: P0)

As a researcher, I need an operational local Dolphin MCP before archive-toolkit development so that game experiments can be executed and inspected through the same reproducible interface.

**Why this priority**: The user requires MCP integration as a preliminary project-creation step. A listed tool is not proof of an operational emulator capability.

**Independent Test**: Connect an MCP client, launch the supplied SSA Wii dump in the dedicated Dolphin profile, identify the running game, send Wii Remote/Nunchuk input, capture a rendered frame and logs, save and restore an emulator state, then repeat the launch through a Riivolution descriptor.

**Acceptance Scenarios**:

1. **Given** the installed MCP and Dolphin runtime, **When** a fresh client connects, **Then** it discovers the tools and can launch and communicate with the emulator without manual script loading.
2. **Given** the supplied SSA dump is running, **When** the client requests observations and controller actions, **Then** the game identity, memory, rendered images, logs and actual input results are recorded as evidence.
3. **Given** a state has been saved, **When** it is restored, **Then** the completed state file exists and the restored game remains responsive.
4. **Given** a known local file replacement, **When** a Riivolution test launch runs, **Then** the replacement path and expected game behavior are verified without modifying the original dump.
5. **Given** a required capability is untested or unavailable, **When** readiness is reported, **Then** M0 remains PARTIAL or FAIL and the corresponding missing evidence is explicit.

---

### User Story 1 - Prove archive round-trip (Priority: P1)

As a game-mod research user, I want to extract an original game archive and rebuild it without intentional content changes so that I can determine whether replacement archives are accepted during normal level loading.

**Why this priority**: A valid archive round-trip is the foundational proof. No level editor work has value until a rebuilt archive can be loaded safely.

**Independent Test**: Use one original archive, extract it, rebuild it, replace it through the external patch workspace, and enter the corresponding level in the test environment.

**Acceptance Scenarios**:

1. **Given** an accessible original game archive, **When** the researcher extracts and rebuilds it without modifying its contents, **Then** the rebuilt archive passes structural validation before it is used.
2. **Given** a structurally valid rebuilt archive, **When** it replaces its original counterpart through the patch workspace, **Then** the game starts, the associated level is reachable, and its expected assets load without a crash or load error.
3. **Given** the round-trip test has an observed failure, **When** the researcher records the result, **Then** the result identifies the failing stage and preserves enough comparison evidence to continue format research.

---

### User Story 2 - Prove a controlled world change (Priority: P2)

As a game-mod research user, I want to change one identified world value and observe the predicted in-game result so that I can prove a level data structure controls a real object property.

**Why this priority**: An archive writer alone does not demonstrate level-editing feasibility. The project needs a deterministic link between a data mutation and a visible world change.

**Independent Test**: Select one documented candidate value, change only that value, rebuild and patch the affected resource, then compare the in-game result with the baseline.

**Acceptance Scenarios**:

1. **Given** an identified candidate structure and a baseline level, **When** the researcher changes one documented value, **Then** the test records the exact original and replacement values and their location.
2. **Given** a single controlled change intended to move an object on one axis, **When** the modified level is loaded, **Then** the object moves in the predicted direction by an observable amount while unrelated baseline behavior remains usable.
3. **Given** the observed result is not deterministic, **When** the experiment is repeated with the same input, **Then** the finding remains unconfirmed and is not exposed as an editable level property.

---

### User Story 3 - Preserve reproducible research evidence (Priority: P3)

As a reverse-engineering contributor, I want every archive and level finding to include evidence, confidence, and reproducible inputs so that later work can build on validated knowledge rather than assumptions.

**Why this priority**: The file formats and level structures are initially unknown; traceable evidence prevents accidental reliance on guesses.

**Independent Test**: Review a recorded finding and reproduce its experiment from the documented original input, mutation, patch output, and observed result.

**Acceptance Scenarios**:

1. **Given** a discovered archive or level field, **When** it is documented, **Then** its location, data representation, byte order where known, proposed meaning, evidence, and confidence are recorded.
2. **Given** two comparable inputs that differ in one controlled variable, **When** the researcher compares them, **Then** the result distinguishes container metadata, content changes, and padding or alignment changes.
3. **Given** a finding has not been proven experimentally, **When** it is published in project documentation, **Then** it is labelled as a hypothesis rather than a confirmed behavior.

### Edge Cases

- An archive may be malformed, truncated, unsupported, or contain entries whose boundaries overlap; it must be rejected with the affected location and validation reason.
- Extraction can succeed while rebuilding produces a structurally valid archive that the game rejects; this remains an M1 failure and must retain comparison evidence.
- A candidate numeric value may occur in unrelated data, may use an unexpected byte order, or may control a property other than position; one inconclusive mutation does not confirm its meaning.
- A visible geometry change may not alter collision behavior; visual and collision validation are separate outcomes.
- A source game dump may be unavailable, incomplete, or regionally different; the toolkit must report the detected identity and only operate on supported material.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST identify the supplied Wii game dump and report the detected game identity and region when that information is available.
- **FR-002**: The system MUST provide a reproducible workflow to locate the game filesystem and identify candidate SSA archives without altering the original game dump.
- **FR-003**: The system MUST inspect supported SSA archives and report their version, contained entries, names where available, locations, stored sizes, logical sizes, alignment, hash data where available, and compression state.
- **FR-004**: The system MUST extract every readable entry of a supported archive into a researcher-controlled workspace while preserving the metadata needed to rebuild it.
- **FR-005**: The system MUST rebuild a supported archive from an extracted workspace and validate its header, entry count, offsets, alignment, lengths, overlaps, name data, hash data, compression state, and file boundaries before use.
- **FR-006**: For each failed archive validation, the system MUST report the affected location, actual value, expected constraint or value, and a clear failure reason.
- **FR-007**: The system MUST compare an original archive and a rebuilt archive, reporting changed locations, old and new values, size changes, and whether each difference belongs to metadata, tables, content, or padding.
- **FR-008**: The system MUST support the M1 archive round-trip experiment and record it as PASS only when the rebuilt archive loads through the patch workflow with no crash, load error, missing expected assets, or inaccessible target level.
- **FR-009**: The system MUST generate a patch workspace containing only replacement resources and the rules required to load them alongside the unchanged original game dump.
- **FR-010**: The system MUST provide research utilities to find plausible scalar values and grouped numeric values in candidate level resources, including both byte orders and vectors of two, three, four, or sixteen values.
- **FR-011**: The system MUST support a controlled, one-value mutation experiment and record the source value, replacement value, location, predicted effect, observed effect, test input, and confidence classification.
- **FR-012**: The system MUST mark M2 as PASS only when repeating a controlled world mutation produces the predicted, observable in-game result.
- **FR-013**: The system MUST classify each documented finding as **CONFIRMED**, **LIKELY**, or **UNKNOWN**, and MUST prevent UNKNOWN findings from being presented as stable editable properties.
- **FR-014**: The system MUST maintain separate evidence records for world entities, visible geometry, collisions, gameplay logic, and inter-resource references as those structures are discovered.
- **FR-015**: The system MUST not begin substantial level-editor, 3D viewport, import, object-creation, or menu-expansion work until both M1 and M2 are recorded as PASS.
- **FR-016**: After M1 and M2 pass, the system MUST support size-preserving edits to only experimentally confirmed properties before attempting additions, deletions, duplication, geometry, collision, or gameplay changes.
- **FR-017**: The system MUST keep all test samples local to the researcher’s supplied dump and MUST not package or distribute protected game content.
- **FR-018**: Project creation MUST include the preliminary gate **M0 — Operational Dolphin MCP**, completed before substantive SSA archive or level-toolkit implementation. Installation and diagnostic work required to validate M0 are in scope before that gate.
- **FR-019**: The MCP MUST expose launch/stop, runtime status, game-memory inspection and controlled writes, Wii Remote/Nunchuk input, screenshots, logs, save/load states, and Riivolution launch preparation. Each capability MUST distinguish implementation, successful invocation, and observed in-game validation.
- **FR-020**: The MCP MUST isolate research profiles and evidence from the user's existing Dolphin installation, preserve the original dump, reject invalid inputs, bound failed requests, and report unsupported operations explicitly.

### Key Entities

- **Source Game Copy**: The researcher-supplied original Wii game dump, identified by game and region and never modified by the toolkit.
- **Archive**: A contained SSA resource with structural metadata, entries, and validation status.
- **Extracted Workspace**: The local representation of one archive’s readable entries and the metadata required for a rebuild.
- **Patch Workspace**: The replacement-only files and loading rules applied alongside the original game copy.
- **Experiment**: A reproducible baseline and mutation pair, including intended change, observed outcome, and result status.
- **Research Finding**: A documented claim about a data structure, with evidence and one of the three confidence levels.
- **Validation Gate**: A named milestone (M1 through M5) with prerequisites, test evidence, and PASS, FAIL, or UNKNOWN status.

### Scope Boundaries

- The MVP is a strongly transformed replacement of an existing selectable level, not a new menu chapter or an altered original game image.
- The first mandatory feasibility gates are M1 (archive round-trip) and M2 (controlled world mutation).
- M0 is the mandatory environment prerequisite before those feasibility experiments; it does not prove M1 or any level-editing capability. Its acceptance and evidence are tracked in `docs/mcp/dolphin-mcp.md`.
- Object duplication, geometry, collision, gameplay sequences, and a full editor remain later research gates, respectively M3, M4A, M4B, and M5.
- New playable character content, Portal changes, custom multiplayer, custom cinematics, new shaders, new music, and distribution of modified game images are outside this feature’s initial scope.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every supported archive selected for testing, the researcher can obtain an inspection report and either a complete extraction or a failure report that identifies the first unreadable or invalid location.
- **SC-002**: At least one unmodified archive completes the M1 round-trip test and its target level remains reachable with all expected assets visibly loaded in the emulation test environment.
- **SC-003**: For each M1 test, a comparison report accounts for 100% of byte differences between the original and rebuilt archive as metadata, table, content, or padding differences.
- **SC-004**: At least one controlled M2 experiment is repeated twice with the same input and produces the same predicted visible result both times.
- **SC-005**: Every finding used to justify a level-editing capability has a reproducible experiment record and a confidence label; unproven findings have no CONFIRMED label.
- **SC-006**: No level-editor implementation work begins before the project evidence shows both M1 and M2 as PASS.
- **SC-007**: The project can be assessed at any time through the six named milestones, with feasibility considered demonstrated only when M1, M2, M3, M4A, M4B, and M5 all pass.
- **SC-008**: Before SSA toolkit implementation begins, one repeatable M0 record covers every required MCP capability, including a real SSA launch, controller response, memory read/write verification, screenshots/logs, completed save/load, and a verified replacement-file launch. Missing tests MUST never be counted as passes.

## Assumptions

- The researcher has lawful local access to an original SSA Wii game dump, the required test environment, and a permitted replacement-file workflow.
- Existing evidence that the game runs in the emulator, recognizes the virtual Portal of Power, accepts replacement files, and permits extraction of certain archives is treated as a starting condition and will be recorded with the associated test corpus.
- Initial work is limited to the known SSA archive version and expands to other versions only after an explicit compatibility finding.
- The project may use exploratory scripts and a later structured toolkit, but implementation choices do not change the validation gates in this specification.
- A byte-for-byte identical archive rebuild is desirable but is not required for M1; semantic structural equivalence and successful in-game loading are authoritative.
