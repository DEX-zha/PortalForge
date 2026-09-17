# Implementation Plan: IGZ v5 Level Object Model and Entity Duplication

> Scope reviewed 2026-09-17: this feature records its original design and evidence. Later extensions and
> remaining work are mapped in the [specification status](../README.md); historical limits below are not the
> current editor limits.

**Branch**: `002-igz-entity-model` | **Date**: 2026-09-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-igz-entity-model/spec.md`

## Summary

Add an IGZ v5 object-graph inspector to `tools/ssa-archive` (sections, type table, per-type sizes, objects, string and object references, explicit unparsed regions), a live-position-to-object matcher built on the feature-001 `ram-diff`/`live-probe` tools, an entity classification workflow that promotes field findings only through repeated in-game experiments, and a duplication path (clone one CONFIRMED entity record, rewrite counts, tables and references, validate, run twice) that decides gate M3. Everything reuses the feature-001 container, codec, patch and experiment infrastructure; the project remains a non-commercial fan research effort with no game data in the repository.

## Technical Context

**Language/Version**: Node.js 24 (ES modules), same package `tools/ssa-archive`.

**Primary Dependencies**: feature-001 modules (`src/iga/*`, `src/patch/riivolution.mjs`, `src/experiments/run-game.mjs`, `live-probe.mjs`, `m2-mutation.mjs`, `src/research/findings.mjs`); Ajv for the new schemas; no new runtime dependency.

**Storage**: decoded IGZ files and object-graph JSON under `.local/workspaces/<level>/`; finding records under `docs/findings/records/`; experiment records under `.local/dolphin-evidence/experiments/`.

**Testing**: `node --test`; a synthetic IGZ v5 builder (header, section table, type table, sizes, objects with the `{type, 1, 0x01xxxxxx}` header, string section) for unit tests; fixture tests on the decoded tutorial `level.bld` skipped when absent; in-game experiments through the MCP for M2-style confirmations and the M3 run.

**Target Platform**: Windows 11 workstation, interactive desktop.

**Project Type**: Library + CLI extension + experiment drivers.

**Performance Goals**: object enumeration of the 31 MB tutorial `level.bld` under 5 s; a clone-rebuild-verify cycle under 30 s; in-game runs stay at 4.6 min per boot (state slot 6 shortens live probes only).

**Constraints**: big-endian IGZ; game data never committed; original dump read-only; findings labelled and promoted only via experiments; a clone that changes the LZMA chunk count of `level.bld` needs the writer to grow the chunk-table area (today refused with `REENCODE_CHUNK_COUNT_CHANGED`).

**Scale/Scope**: tutorial `level.bld` has 9 sections, 224 type names, 21 680 header-pattern objects, 30.9 MB; two other levels for generalisation; three entity types to CONFIRM; one duplication.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.0.0 (`.specify/memory/constitution.md`).

| Principle | Status before Phase 0 | After Phase 1 |
| --- | --- | --- |
| I. Evidence before capability | PASS: every field hypothesis is a finding record; CONFIRMED only through repeated experiments (FR-005) | PASS |
| II. Sequential machine-readable gates | PASS: M0, M1, M2 PASS; this feature targets M3 and writes `docs/m3-status.json`; no editor work | PASS |
| III. Original game never modified | PASS: patch workspaces only | PASS |
| IV. No protected content in the repository | PASS: object-graph JSON stays in `.local/`, tests are synthetic; scope statement in README (FR-008) | PASS |
| V. Reproducible experiments | PASS: reuses the experiment record schema; M3 record adds the duplication plan | PASS |
| VI. Semantic equivalence, byte accounting | PASS: cloned `level.bld` validated structurally; IGA diff classification unchanged | PASS |

No violation; Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-igz-entity-model/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── igz-cli.md
│   ├── object-graph.schema.json
│   └── duplication-plan.schema.json
└── tasks.md   ($speckit-tasks)
```

### Source Code (repository root)

```text
tools/ssa-archive/
├── src/igz/
│   ├── header.mjs        # IGZ v5 file header, section table, section-0 second header
│   ├── types.mjs         # type-name table (with empty entries) and per-type size table
│   ├── objects.mjs       # object enumeration by header pattern + bounding of unparsed regions
│   ├── refs.mjs          # string (section-2-relative) and object (section-relative, flagged) reference resolution
│   ├── graph.mjs         # ObjectGraph assembly, 100 % area accounting, JSON export
│   ├── entities.mjs      # entity classification helpers: position-like fields, dimension filter, box pairs
│   ├── match.mjs         # live RAM position / byte pattern -> owning object and field
│   └── clone.mjs         # DuplicationPlan: copy a record, rewrite counts/tables/refs, validate
├── src/iga/writer.mjs    # extended: chunk-count growth for a re-encoded entry (table area resize)
├── src/experiments/m3-duplicate.mjs
├── cli.mjs               # igz sections|types|objects|show|near|match|clone ; experiment m3
└── tests/
    ├── helpers/synthetic-igz.mjs
    ├── igz-graph.test.mjs, igz-refs.test.mjs, igz-clone.test.mjs, iga-chunk-growth.test.mjs
    └── igz-fixtures.test.mjs   # skipped without .local/samples

docs/findings/records/   # new igz-objects / world-entities / references records
docs/m3-status.json
```

**Structure Decision**: a new `src/igz/` module family beside `src/iga/`, same package and test runner; the M3 driver copies the M2 driver pattern.

## Gate sequencing

| Step | Goal | Exit criterion |
| --- | --- | --- |
| G1 | Object graph with 100 % area accounting on 3 levels | SC-001 |
| G2 | Three entity fields CONFIRMED via screening + 2 formal runs each | SC-002 |
| G3 | Writer supports chunk-count growth; clone validates structurally | FR-006 |
| G4 | M3 duplication experiment, two identical runs | SC-003, `docs/m3-status.json` |

## Complexity Tracking

None.

## Phase outputs

- Phase 0: [research.md](research.md).
- Phase 1: [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).
