# Feature Specification: IGZ v5 Level Object Model and Entity Duplication

> Scope reviewed 2026-09-17: this feature records its original design and evidence. Later extensions and
> remaining work are mapped in the [specification status](../README.md); historical limits below are not the
> current editor limits.

**Feature Branch**: `002-igz-entity-model`

**Created**: 2026-09-12

**Status**: Object model and same-size duplication implemented; M3 PASS. Remaining field research and CLI annotation tasks are tracked in tasks.md.

**Input**: User description: "IGZ v5 level object model: parse the nested level.bld object graph of SSA Wii, document entity records and their transforms with evidence, and prove entity duplication (M3) through the existing MCP experiment workflow"

**Context**: Feature 001 closed gates M0, M1 and M2 (`docs/m0-status.json`, `docs/m1-status.json`, `docs/m2-status.json`). One world property is CONFIRMED and editable: the Skylander spawn position stored in a `tfbPhysicsModel` record of the nested `level.bld` (`docs/findings/world-entities.md`). Everything else about the IGZ v5 object graph is LIKELY or UNKNOWN (`docs/findings/igz-objects.md`). This feature stays a **non-commercial fan research project**: it documents formats and reproducible experiments on the researcher's own copy of the game and never distributes game data (root `README.md`, constitution principles III and IV).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read the object graph of a level (Priority: P1)

As a researcher, I want to list every object of a decoded `level.bld` with its type name, size, fields and references so that I can locate entity records without hexdump guesswork.

**Why this priority**: M2 was reached by matching a live RAM position against raw float triples; duplication, geometry and gameplay research all need the real object boundaries, field layouts and cross-references.

**Independent Test**: Run the object-graph inspector on `Level_027_Tutorial` and on two other levels; the CONFIRMED spawn record must appear as a typed object whose position field is the bytes mutated in M2.

**Acceptance Scenarios**:

1. **Given** a decoded `level.bld`, **When** the inspector runs, **Then** it reports the section table, the type table with per-type sizes, and one record per object with type name, offset, size and the raw fields, and the sum of object sizes accounts for the object area.
2. **Given** the CONFIRMED spawn record, **When** the inspector prints it, **Then** the position field is named, typed `f32be x3` and located at the offset recorded in `docs/findings/records/level.physicsmodel.spawn-candidate.json`.
3. **Given** an object referencing strings or other objects, **When** the inspector resolves references, **Then** each resolved reference names its target (string text or object type and offset) and unresolved words are reported as UNKNOWN, never guessed.

---

### User Story 2 - Identify entity records and their transforms (Priority: P2)

As a researcher, I want to know which object types are level entities (placed actors, NPCs, triggers, cameras, spawners) and where their position, rotation and identity fields live, each with evidence and confidence.

**Why this priority**: M3 duplication needs a complete entity record to clone; LIKELY findings are not enough to mutate safely.

**Independent Test**: For at least three distinct entity types, a one-value mutation predicted from the model produces the predicted in-game effect twice (the M2 procedure), and the corresponding findings become CONFIRMED.

**Acceptance Scenarios**:

1. **Given** the object graph of the tutorial, **When** the researcher classifies objects, **Then** every candidate entity type has a finding record with location, type, endian, meaning, evidence and a confidence label.
2. **Given** a LIKELY position field of an entity other than the Skylander spawn (for example Hugo or a trigger volume), **When** it is mutated and the level is run twice, **Then** the predicted effect is observed in both runs and the finding is promoted to CONFIRMED, or the contradiction is recorded and the finding returns to UNKNOWN.
3. **Given** a live RAM position of a moving or interactable entity, **When** it is matched against the object graph, **Then** the match names the owning object and field rather than a bare offset.

---

### User Story 3 - Duplicate an entity (Priority: P3, gate M3)

As a researcher, I want to clone one CONFIRMED entity record so that two independent instances appear in the level at different positions, proving that object counts, tables, references and sizes can be rewritten consistently.

**Why this priority**: M3 is the first structural change; it decides whether an editor beyond size-preserving edits is feasible (source description sections 10 to 11, spec 001 FR-016).

**Independent Test**: Duplicate the CONFIRMED spawn-related object or another CONFIRMED entity with a +X offset, rebuild, patch, run twice; both instances must be visible or have their predicted distinct effects, and the game must stay playable.

**Acceptance Scenarios**:

1. **Given** a CONFIRMED entity record, **When** it is cloned with a changed position, **Then** the rebuilt `level.bld` passes structural validation (section table, object list count, table sizes, references) before any in-game run.
2. **Given** the patched level, **When** the tutorial is entered twice, **Then** both instances behave as predicted in both runs and no crash or load error occurs, and M3 is recorded PASS with the experiment ids.
3. **Given** a duplication attempt that crashes or shows a single instance, **When** the result is recorded, **Then** the failing stage (validation, load, count, reference) is identified and M3 stays FAIL or UNKNOWN.

### Edge Cases

- Objects whose header does not follow the `{type index, 1, 0x01xxxxxx}` pattern (non-reference-counted nodes, inline arrays) must still be bounded by neighbouring objects and reported as unparsed regions, never silently skipped.
- Type-name tables differ between levels (224 names in the tutorial); type indexes must be resolved per file.
- Fields that look like positions but are dimensions (multiples of 1.524, feet to metres) or trigger boxes (min/max pairs) must not be labelled positions without an in-game test.
- Duplicating an object may require new string offsets, hash values or identifiers (0x01xxxxxx ids); any unknown identifier scheme blocks M3 and is recorded as such.
- A save state restores original level data: it is valid for live probes only, never for judging a patched archive.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST parse the IGZ v5 header, section table, type-name table and per-type size table of a decoded `level.bld` and report them with confidence labels.
- **FR-002**: The system MUST enumerate objects with type, offset, size and raw fields, bound unparsed regions explicitly, and account for 100 % of the object area as objects, unparsed regions or padding.
- **FR-003**: The system MUST resolve string references (section 2, section-relative offsets) and object references (section-relative, flagged pointers) and mark unresolved words UNKNOWN.
- **FR-004**: The system MUST match a live RAM position or byte pattern to the owning object and field of the decoded IGZ.
- **FR-005**: The system MUST record every entity-field hypothesis as a finding record with evidence and MUST promote to CONFIRMED only through a repeated M2-style experiment referencing the finding.
- **FR-006**: The system MUST support cloning a CONFIRMED entity record with modified fields, updating object counts, tables and references, and MUST validate the result before use.
- **FR-007**: The system MUST record the M3 experiment (control, two identical patched runs, predictions, observations, screenshots, served archive size) and mark M3 PASS only when both runs show the predicted independent instances.
- **FR-008**: The system MUST keep all game-derived data under `.local/`, MUST never modify the original dump, and MUST keep the fan-research scope statement visible in the documentation.

### Key Entities

- **Object Graph**: sections, type table, objects, references of one decoded IGZ.
- **Entity Record**: an object classified as a placed level entity with named fields (identity, position, rotation, parameters) and a confidence label per field.
- **Duplication Plan**: source record, changed fields, tables and references to update, validation result.
- **Experiment** and **Research Finding**: as defined in feature 001 (`specs/001-ssa-level-research/data-model.md`), reused unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The inspector accounts for 100 % of the object area of `Level_027_Tutorial` and of two other levels as typed objects, explicit unparsed regions or padding.
- **SC-002**: At least three entity field findings other than the spawn position reach CONFIRMED through repeated experiments; each negative result is recorded.
- **SC-003**: One entity duplication produces two independent instances in two identical runs (M3 PASS), or the blocking unknown (identifier scheme, reference table, count field) is named in `docs/m3-status.json`.
- **SC-004**: Every in-game experiment of this feature is reproducible from its JSON record and appears in `docs/experiments/README.md`.
- **SC-005**: The repository still contains no game data and the scope statement is present in `README.md`.

## Assumptions

- The IGA v4 container, LZMA chunk codec, patch workspace, MCP experiment drivers, `ram-diff`, `live-probe` and the findings state machine from feature 001 are reused as they are.
- Research stays on the tutorial level first (fast to reach, known spawn record); other levels serve to check that findings generalise.
- The researcher continues to use a lawful personal copy of the game; no content is redistributed.
- The 0x01xxxxxx object identifiers are probably unique per file; whether they must be unique or hashed is a research question of this feature, not an assumption.
