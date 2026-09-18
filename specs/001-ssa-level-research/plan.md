# Implementation Plan: SSA Level Research

> Scope reviewed 2026-09-17: this feature records its original design and evidence. Later extensions and
> remaining work are mapped in the [specification status](../README.md); historical limits below are not the
> current editor limits.

**Branch**: `001-ssa-level-research` | **Date**: 2026-09-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-ssa-level-research/spec.md`

**Note**: This template is filled in by the `$speckit-plan` command; its definition describes the execution workflow.

## Summary

Build the **SSA Research Toolkit**: a Node.js library and CLI (`ssa-archive`) that identifies the supplied SSA Wii dump, inspects, extracts, verifies, rebuilds and diffs IGA version 4 archives, generates a replacement-only Riivolution patch workspace, and drives the already validated Dolphin MCP (M0 PASS) to run the M1 round-trip and M2 controlled-mutation experiments with recorded evidence. Research (Phase 0) confirmed the IGA v4 container layout on three local archives, established that level `.arc` files are fully uncompressed while `.bld` files hold LZMA-chunked `.pak`/nested `level.bld` entries, and fixed the technical approach: a byte-preserving rebuild strategy for M1, then chunk-level re-encoding only for the single entry mutated in M2. No editor work is planned until M1 and M2 are PASS (FR-015).

## Technical Context

**Language/Version**: Node.js 24.21 (ES modules), the only runtime present on the workstation and the one already used by the Dolphin MCP. Python and .NET are not installed; see research R1 for the deviation from the original recommendation.

**Primary Dependencies**: Node core only for parsing (`Buffer`, `node:fs`, `node:crypto`); one pure-JavaScript LZMA codec pinned after the R7 evaluation (`lzma-purejs` candidate, `lzma1` fallback); existing `tools/dolphin-mcp` (MCP client SDK 1.29.0, `runtime.mjs` helpers) for in-game acceptance; `DolphinTool.exe` from the user's Dolphin 2606a for disc identification and file extraction.

**Storage**: Local files only. Original dump read-only at its Desktop path; extracted samples and workspaces under `.local/samples/` and `.local/workspaces/`; patch workspaces under `.local/patches/`; experiment and finding records as JSON under `.local/dolphin-evidence/` and Markdown under `docs/`. Nothing containing game data is committed (`.gitignore` already excludes `.local/`, `*.wbfs`, `*.sky`).

**Testing**: `node --test`. Unit tests on synthetic in-memory IGA v4 archives (committed, no game data). Fixture tests that run only when the local samples exist (skipped otherwise with an explicit message). Acceptance experiments (`m1-roundtrip`, `m2-mutation`) are MCP-driven scripts that write JSON records and exit non-zero on failure, following the `m0-proof.mjs` pattern.

**Target Platform**: Windows 11 workstation, interactive desktop (native Dolphin UI automation), local only.

**Project Type**: Library + CLI (`tools/ssa-archive/`), plus experiment scripts. No service, no UI.

**Performance Goals**: Parse and verify a 53 MB level `.arc` in under 5 s; byte-preserving rebuild in under 30 s; one in-game experiment cycle (patched boot, figure, level entry, capture, stop) under 3 min so an M2 pair of repeats fits in 10 min. *Measured 2026-09-12*: verify 0.12 s, extract 0.26 s, rebuild 0.32 s, full re-encode of a 15 MB `.bld` (945 LZMA chunks) 18 s; one boot-to-tutorial run takes 4.6 min because the intro cinematic and Hugo dialogues cannot be skipped (`Plus` pauses), so an M1 experiment with its control run lasts 9.2 min and an M2 pair of repeats about 10 min with `--skip-control`. The 3 min target is not reachable without a native save state, which only helps live-memory probes (a state restored on a patched disc still holds the original level data).

**Constraints**: Never write to the WBFS or the user's Dolphin 2606a profile; all header fields little-endian as observed; entry data aligned to 0x800; descriptor paths written with forward slashes (Dolphin splits XML paths on `/` only); findings labelled CONFIRMED/LIKELY/UNKNOWN and UNKNOWN never exposed as editable; a booting patched game is never counted as proof that a file was consumed (measure via file monitor size or memory).

**Scale/Scope**: One dump (SSPP52, PAL, revision 1), 309 disc files, 153 files under `level/` as `.arc`+`.bld` pairs; sample archives have 7 to 477 entries. Toolkit scope for this feature: IGA v4 read/write/verify/diff, patch workspace, float/vector scanner, binary diff, two experiment drivers, findings documentation. IGZ parsing is limited to what M2 requires (locating one transform), not a full IGZ model.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

At initial planning, `.specify/memory/constitution.md` was an unfilled template. It is now ratified at 1.2.0;
the table below records the original pre-implementation check, while the current constitution governs changes.
The invariants originated in the specification and `AGENTS.md`:

| Gate | Source | Status before Phase 0 | Status after Phase 1 |
| --- | --- | --- | --- |
| No editor, viewport, import or object-creation work before M1 and M2 PASS | FR-015, SC-006 | PASS (plan contains no such work) | PASS |
| Original dump and user's Dolphin never modified | FR-002, FR-017, AGENTS.md | PASS (read-only DolphinTool extraction, isolated `.local/` profiles) | PASS |
| No protected game content in the repository | FR-017 | PASS (`.gitignore`, synthetic test fixtures) | PASS |
| M0 PASS before toolkit implementation | FR-018, SC-008 | PASS (`docs/m0-status.json`, 2026-09-12) | PASS |
| Every finding carries evidence and a confidence label; UNKNOWN never editable | FR-013, SC-005 | PASS (research.md uses the labels; data model enforces) | PASS |
| Readiness never inferred from tool listing, launch or boot alone | AGENTS.md | PASS (experiment records require observed evidence fields) | PASS |

No violation; Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-ssa-level-research/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── ssa-archive-cli.md            # CLI commands, JSON outputs, exit codes
│   ├── workspace-manifest.schema.json
│   ├── experiment-record.schema.json
│   └── finding-record.schema.json
└── tasks.md             # Phase 2 output ($speckit-tasks - NOT created by $speckit-plan)
```

### Source Code (repository root)

```text
tools/
├── dolphin-mcp/                 # Existing, M0 PASS; unchanged except reuse of runtime.mjs helpers
└── ssa-archive/
    ├── package.json             # private, "type": "module", engines node >= 22, pinned LZMA codec
    ├── cli.mjs                  # ssa-archive identify|info|list|extract|verify|rebuild|diff|patch|scan|experiment
    ├── src/
    │   ├── iga/
    │   │   ├── header.mjs       # v4 header/table decode and encode (little-endian)
    │   │   ├── reader.mjs       # entries, names, hashes, chunk tables, entry byte access
    │   │   ├── chunks.mjs       # 0x8000 chunking, chunk-size table, LZMA decode/encode adapters
    │   │   ├── writer.mjs       # byte-preserving rebuild; re-encode only replaced entries
    │   │   ├── verify.mjs       # structural validation, one report line per failure
    │   │   └── diff.mjs         # original vs rebuilt classification: metadata|table|content|padding
    │   ├── disc/
    │   │   ├── identify.mjs     # DolphinTool header -> game id, region, revision
    │   │   └── extract.mjs      # DolphinTool extract -g -s wrapper, read-only on the dump
    │   ├── workspace/
    │   │   └── manifest.mjs     # extracted workspace manifest read/write/validate
    │   ├── patch/
    │   │   └── riivolution.mjs  # XML + descriptor generation via dolphin-mcp buildDescriptor
    │   ├── research/
    │   │   ├── scan-floats.mjs  # scalar/vector search, both byte orders (FR-010)
    │   │   └── bindiff.mjs      # offset, old, new, size, context; region classification
    │   └── experiments/
    │       ├── m1-roundtrip.mjs # extract -> rebuild -> verify -> diff -> patch -> MCP boot/level/capture
    │       └── m2-mutation.mjs  # one-value mutation, repeated run, prediction vs observation
    └── tests/
        ├── iga-synthetic.test.mjs      # committed synthetic archives
        ├── iga-fixtures.test.mjs       # skipped unless .local/samples exists
        ├── verify-diff.test.mjs
        └── patch-workspace.test.mjs

docs/
├── dolphin-mcp.md               # existing
├── iga-v4.md                    # container findings, field table with confidence labels
├── findings/                    # one Markdown per discovered structure (transforms.md, ...)
└── experiments/                 # human-readable summaries of M1/M2 runs

.local/                          # git-ignored
├── samples/DATA/files/...       # DolphinTool extractions of original archives
├── workspaces/<archive-id>/     # extracted entries + manifest.json
├── patches/<experiment-id>/     # riivolution XML, replacement files, launch.json
└── dolphin-evidence/            # JSON records, screenshots, logs (existing)
```

**Structure Decision**: Single Node.js package `tools/ssa-archive/` beside the existing `tools/dolphin-mcp/`, sharing its runtime helpers (descriptor builder, evidence paths, MCP client pattern) rather than duplicating them. Findings live in `docs/` as the specification's documentation base; machine-readable records live in `.local/` because they reference local game data.

## Gate sequencing

| Step | Target archive | Why | Exit criterion |
| --- | --- | --- | --- |
| M1a | `level/Level_027_Tutorial.arc` (477 uncompressed entries) | Simplest writer path: no compression, hashes and names copied verbatim | Byte-identical or fully classified diff; tutorial level reachable with Sonic Boom, assets loaded, captures recorded |
| M1b | `level/Level_027_Tutorial.bld` (6 `.pak` + nested `level.bld`, LZMA chunks) | Where level data most likely lives; needed before any M2 mutation | Chunk-preserving rebuild loads; then decode/re-encode round-trip of one entry loads |
| M2 | One value inside the nested `level.bld` (or an uncompressed candidate if found) | Deterministic link data -> world | Predicted axis move observed twice; recorded per FR-011 |

M1 is recorded PASS only when M1a and M1b both load in game (FR-008); M1a alone is progress, not a gate.

## Complexity Tracking

No constitution violations to justify.

## Phase outputs

- Phase 0: [research.md](research.md), all Technical Context decisions resolved; container findings labelled.
- Phase 1: [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).
- Constitution Check re-evaluated after design: unchanged, PASS on all six spec-derived gates; constitution ratification still recommended.
