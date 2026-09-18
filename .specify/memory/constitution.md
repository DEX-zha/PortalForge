# PortalForge Constitution

Ratified from the invariants that `specs/001-ssa-level-research/spec.md` and `AGENTS.md` already impose and that `plan.md` uses as its Constitution Check. Amend through a pull request that updates this file, the plan's Constitution Check and `AGENTS.md` together.

## Core Principles

### I. Evidence before capability
A capability exists only when runtime evidence shows it: a tool listing, a process launch, a scheduled action, a successful boot of a Riivolution descriptor, or an empty screenshot never counts as proof. Every finding carries evidence and one of the labels CONFIRMED, LIKELY or UNKNOWN; UNKNOWN findings are never presented as editable properties (FR-013, SC-005). One exception is written into principle III: an experimental native addition, which is allowed because its proof is taken by every run that carries it.

### II. Gates are sequential and machine-readable
M0 (Dolphin MCP) precedes toolkit work; M1 (archive round-trip) and M2 (controlled world mutation) must both be PASS before any editor, viewport, import, object-creation or menu-expansion work (FR-015, FR-018, SC-006). Gate status lives in `docs/m*-status.json` with the experiment ids that justify it; a documented FAIL is a valid, useful outcome.

### III. The original game is never modified
The WBFS dump and the user's own Dolphin installation are read-only. Archive experiments use replacement-only Riivolution patch workspaces in the isolated `.local/` profile (FR-002, FR-009, FR-017, FR-020). A separately CONFIRMED native addition recipe may accompany that workspace as temporary Dolphin Gecko code: require revision/factory fingerprints, handler-owned storage, distinct visible instances on two cold boots, preservation of originals, and profile restoration after confirmed stop. This does not authorize IGZ insertion or advance geometry, collision or gameplay gates.

An addition whose source has no CONFIRMED recipe of its own is an **experimental addition**. It is allowed on these conditions: the recipe that creates it is the CONFIRMED one, with the level's measured place in memory; it is marked experimental in the session, in the file saved next to the level and in the patch; every run that carries it reads it back from the game's memory (class, state, actor, source, model, script, requested transform) and files the result under its family; its card states that evidence and never the word confirmed; a family becomes a finding only through the usual two identical boots and review. A failed experimental addition is a recorded result, not a failed run.

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

Amendment 2026-09-17: the gate before adding made the editor's main use impractical (nine addable sources for 673 objects on the tutorial, none on the other 75 levels; 153 families to boot one by one on a single level). The user decided that any object must be addable, objects with nothing to draw included, and that proof must follow the addition. Principle III now defines the experimental addition; principle I names it as its one exception. Study and measurements: `specs/007-unlimited-additions/study-add-anything.md`; experiments A1 and A2 of that feature created 8 of 8 and 32 of 32 additions on another level, twice each, from placed objects and stored templates alike.

**Version**: 1.2.0 | **Ratified**: 2026-09-12 | **Last Amended**: 2026-09-17
