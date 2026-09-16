# PortalForge Constitution

Ratified from the invariants that `specs/001-ssa-level-research/spec.md` and `AGENTS.md` already impose and that `plan.md` uses as its Constitution Check. Amend through a pull request that updates this file, the plan's Constitution Check and `AGENTS.md` together.

## Core Principles

### I. Evidence before capability
A capability exists only when runtime evidence shows it: a tool listing, a process launch, a scheduled action, a successful boot of a Riivolution descriptor, or an empty screenshot never counts as proof. Every finding carries evidence and one of the labels CONFIRMED, LIKELY or UNKNOWN; UNKNOWN findings are never presented as editable properties (FR-013, SC-005).

### II. Gates are sequential and machine-readable
M0 (Dolphin MCP) precedes toolkit work; M1 (archive round-trip) and M2 (controlled world mutation) must both be PASS before any editor, viewport, import, object-creation or menu-expansion work (FR-015, FR-018, SC-006). Gate status lives in `docs/m*-status.json` with the experiment ids that justify it; a documented FAIL is a valid, useful outcome.

### III. The original game is never modified
The WBFS dump and the user's own Dolphin installation are read-only. Archive experiments use replacement-only Riivolution patch workspaces in the isolated `.local/` profile (FR-002, FR-009, FR-017, FR-020). A separately CONFIRMED native addition recipe may accompany that workspace as temporary Dolphin Gecko code: require revision/factory fingerprints, handler-owned storage, distinct visible instances on two cold boots, preservation of originals, and profile restoration after confirmed stop. This does not authorize IGZ insertion or advance geometry, collision or gameplay gates.

### IV. No protected content in the repository
Game data, figures, saves, memory dumps and captured game images stay in `.local/`, which is git-ignored. Tests use synthetic fixtures; fixture tests skip when local samples are absent (FR-017).

### V. Reproducible experiments
Every experiment is a JSON record (`contracts/experiment-record.schema.json`) with inputs, hashes, patch descriptor, input script, monitor lines, screenshots and outcome, reproducible from `docs/experiments/README.md`. An M2 result is PASS only when the predicted effect is observed in every repeat (FR-011, FR-012, SC-004).

### VI. Semantic equivalence, byte-level accounting
A rebuilt archive is accepted when it parses to the same structure and the game loads it; byte identity is desirable, not required. Every byte difference between original and rebuild is classified as metadata, table, content or padding (SC-003).

## Technology constraints

Node.js 24 (ES modules) for the toolkit and the MCP; `node --test` for tests; DolphinTool for disc access; the Felk `scripting-preview4` Dolphin runtime for the MCP. Descriptor and Riivolution paths use forward slashes and root-relative `external` paths. Language migrations (Python, C#) are allowed only after the formats they touch are CONFIRMED.

## Development workflow

Spec-kit flow: `speckit-specify` → `speckit-plan` → `speckit-tasks` → `speckit-implement`. Tests are written before the implementation they cover. Each task is checked in `tasks.md` when done; gate status files and `docs/findings/records/` are updated in the same change as the evidence that justifies them.

## Governance

This constitution supersedes other practices in this repository. Changes require a documented rationale, a version bump below and matching updates to `AGENTS.md` and the active plan's Constitution Check.

Amendment 2026-09-16: native placement creation needs an accompanying executable recipe because insertion into the archive is not valid. Finding `level.prop.native-addition` and experiment `native-addition-two-boots-20260916` establish the limited alternative while preserving the original game and existing gates.

**Version**: 1.1.0 | **Ratified**: 2026-09-12 | **Last Amended**: 2026-09-16
