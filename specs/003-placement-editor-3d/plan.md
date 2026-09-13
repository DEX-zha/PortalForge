# Implementation Plan: 3D placement editor

**Branch**: `003-placement-editor-3d` | **Date**: 2026-09-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-placement-editor-3d/spec.md`

## Summary

Give the placement model a body. The project can already read every placement of a level, resolve its model and
its layers, grade an edit against safety rules, write a validated file, build a replacement patch and launch the
game. What is missing is a way to see a level in space and point at an object. This feature adds a local editor:
a Node process that owns the file and every mutation, and a browser view on localhost that draws one box per
placement, grouped by layer, with move, rotate and scale gizmos.

The architectural rule that shapes everything else: **the view never writes bytes**. The browser sends intents,
the Node process applies them through the planners that are already validated and boot-proven, re-runs the same
validation, and only then writes, patches and launches. Nothing about the file format moves into the UI.

## Technical Context

**Language/Version**: Node.js 24 (ES modules) for the editor process; the view is plain ES modules in a browser,
no build step and no transpiler, so the same language and module system run on both sides.

**Primary Dependencies**: the existing toolkit modules (`src/igz/model-resolve.mjs`, `src/editor/placements.mjs`,
`src/editor/safety.mjs`, `src/igz/relocate.mjs`, the patch workspace builder and the experiment runner) plus one
new runtime dependency, `three`, for WebGL rendering and its transform gizmos. The HTTP layer uses `node:http`
directly, so the editor adds no server framework.

**Storage**: files only. Levels are read from and written to decoded workspace files under `.local/`; patches are
built into `.local/patches/`; experiment records land in `.local/dolphin-evidence/experiments/`. Nothing is added
to the repository and no database exists.

**Testing**: `node --test`. Everything that can be decided without a screen (session state, layer filtering, hit
ordering, intent application, save validation, patch refusal, launch record) lives in pure modules and is unit
tested. The rendering glue is deliberately thin and is validated by the quickstart and by in-game runs.

**Target Platform**: Windows desktop, one researcher, offline. The view runs in the researcher's own browser
against `http://127.0.0.1:<port>`; `three` is served from `node_modules`, so nothing is fetched from a network.

**Project Type**: local single-user tool, two surfaces in one repository: an editor server inside the existing
toolkit and a static view it serves.

**Performance Goals**: a level of about seven hundred placements visible in under five seconds from opening the
file, and camera movement at 60 frames per second. One instanced draw call for all proxies makes the frame budget
irrelevant at this object count; the five seconds are spent almost entirely in parsing and resolving the file.

**Constraints**: no byte is written by the view; every mutation goes through an existing planner and its
validation. The original disc image and the researcher's own emulator installation stay untouched. A patch that a
running game session is reading is never overwritten. The editor never starts the game on its own initiative.

**Scale/Scope**: five level files in the validation corpus, the largest with 673 placements and 210 model records;
up to a few hundred edits in a session; one level open at a time.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
| --- | --- | --- |
| I. Evidence before capability | The UI must show, per attribute, whether the value is runtime-confirmed or structural, and must refuse to edit what the evidence does not support | **PASS by design**: FR-008 and FR-013; the placement record already carries `evidence` per attribute, and the view renders it rather than hiding it |
| II. Gates are sequential | M1 and M2 must both be PASS before any editor or viewport work | **PASS**: M0, M1, M2 and M3 are all PASS (`docs/m*-status.json`), verified by `ssa-archive gates` |
| III. The original game is never modified | Read-only disc image, replacement-only patch workspaces, isolated profile | **PASS**: the editor calls the existing patch builder and experiment runner; it adds no new path to the game files |
| IV. No protected content in the repository | Level data, screenshots and dumps stay in `.local/` | **PASS**: the editor reads and writes only under `.local/`; the repository receives source, contracts and docs |
| V. Reproducible experiments | Every launch is a JSON experiment record with inputs, hashes, prediction and outcome | **PASS by design**: FR-024 and FR-025 reuse the existing experiment record; the editor refuses to launch without a stated prediction |
| VI. Semantic equivalence, byte accounting | Every byte difference is accounted for | **PASS by design**: FR-021 reuses the existing save validation, which already refuses any change outside the edited object and its declared reference counts |
| Technology constraints | Node.js 24 ESM, `node --test`, no language migration | **PASS**: both surfaces are ES modules on Node 24 and in the browser; no Python or C# is introduced |

One point deserves naming rather than hiding. The constitution allows language migrations only after the formats
they touch are CONFIRMED, and this feature introduces a second runtime surface, the browser. It is not a
migration: the language and module system are unchanged, no format parsing happens in the browser, and the view
receives already-resolved records as JSON. The format code stays where it is tested.

**Post-design re-check**: see the end of this document.

## Project Structure

### Documentation (this feature)

```text
specs/003-placement-editor-3d/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── editor-api.md
└── tasks.md             # Phase 2 output ($speckit-tasks, not created here)
```

### Source Code (repository root)

```text
tools/ssa-archive/
├── cli.mjs                        # gains `edit serve`
├── src/
│   ├── editor/
│   │   ├── placements.mjs         # exists: list, show, set transform, replace
│   │   ├── safety.mjs             # exists: rules and severities
│   │   ├── session.mjs            # new: open level, edit intents, undo/redo, dirty state
│   │   ├── save.mjs               # new: validate, write, build patch, launch, record
│   │   └── server.mjs             # new: node:http routes, static view, session lifetime
│   ├── igz/
│   │   ├── model-resolve.mjs      # exists: structural resolution, layers, evidence
│   │   └── corpus.mjs             # exists: corpus validation
│   └── view/                      # new: served as-is to the browser, no build step
│       ├── index.html
│       ├── app.mjs                # wiring only
│       ├── scene.mjs              # instanced proxies, camera, gizmos
│       ├── select.mjs             # hit ordering and cycling (pure, unit tested)
│       ├── layers.mjs             # layer visibility model (pure, unit tested)
│       └── inspector.mjs          # renders the placement record and its evidence
└── tests/
    ├── editor-session.test.mjs    # new
    ├── editor-save.test.mjs       # new
    ├── editor-server.test.mjs     # new
    └── view-select.test.mjs       # new: pure view logic
```

**Structure Decision**: the editor lives inside the existing toolkit package rather than in a new one, because it
is a new front end over modules that already exist there and it must share their tests and their contracts. The
view is a sibling directory of plain ES modules served verbatim, with no bundler, so that reading the shipped file
and reading the source is the same act. The only logic placed in the view is what needs a screen; hit ordering and
layer visibility are pure functions in that directory precisely so they can be unit tested without one.

## Complexity Tracking

No constitution violation to justify. The one new runtime dependency, `three`, replaces what would otherwise be
several thousand lines of hand-written WebGL and gizmo mathematics, and it is served locally rather than fetched.

## Post-Design Constitution Re-Check

Re-evaluated after the Phase 1 artifacts were written:

- **Evidence before capability** holds and got sharper: the API contract makes `evidence` a required field of every
  placement it returns, so a view that forgot to render it would still be carrying it, and the editing endpoints
  refuse an attribute whose evidence is `none`.
- **Gates** are unchanged; the editor refuses to open if the gate files do not report M1 and M2 as PASS, which
  turns the principle into a runtime check rather than a convention.
- **The original game is never modified** is strengthened by the session lock in the data model: a patch being
  read by a running session cannot be rebuilt, which is a failure mode the existing command line does not guard.
- **Reproducible experiments** is enforced by the contract: the launch endpoint requires a prediction string and
  rejects the request without one.
- **Byte accounting** is unchanged: the save endpoint returns the same plan structure the planners already produce,
  including the shared-record report, and refuses to write when validation fails.

No new violation appeared during design, and the Complexity Tracking table stays empty.
