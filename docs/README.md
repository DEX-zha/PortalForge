# Documentation index

Every document here describes file formats, methods and results for *Skylanders: Spyro's Adventure* (Wii,
SSPP52 Rev 1). No game data is stored in this repository; the evidence files, captures and profiles referenced
below live in the untracked `.local/` folder. See the [project README](../README.md) for the scope.

## Formats

| Document | What it covers |
|---|---|
| [format/iga-v4.md](format/iga-v4.md) | The `IGA v4` container: header, entry table, chunk tables, LZMA entries, hash table, trailer. Hand-written introduction plus generated tables. |
| [format/iga-v4.intro.md](format/iga-v4.intro.md) | The introduction alone, kept separate from the generated part. |
| [format/igz-level-editing.md](format/igz-level-editing.md) | The `IGZ v5` object graph of a level: sections, pointers, the header table, placement records, what may be edited and what hangs the loader. |
| [format/igz-mesh-geometry.md](format/igz-mesh-geometry.md) | GX mesh geometry: descriptors, quantisation, how models are tied to placements, and the limits of that association. |

## Editor

| Document | What it covers |
|---|---|
| [editor/roadmap.md](editor/roadmap.md) | The six ordered steps towards every object placeable and every level editable: state, cost and evidence rule of each. |
| [editor/dolphin-workflow.md](editor/dolphin-workflow.md) | The Save → Patch → Launch chain, the launch modes, the `spawn EPERM` permission trap, and moving scripted props. |
| [editor/direct-entry.md](editor/direct-entry.md) | Booting straight into the edited tutorial: checkpoint before level load, FST binding, and why a restored scene is not evidence. |
| [editor/scripted-movement.md](editor/scripted-movement.md) | Barrels and assets: which object actually moves in game, and the controls that showed the difference. |
| [editor/scene-poses.md](editor/scene-poses.md) | Bridges, cannons and model objects: the poses read back from Dolphin, and why the previews stay read-only. |
| [editor/missing-scenery-study.md](editor/missing-scenery-study.md) | Why the ground and the platforms were missing from the view, what was fixed, and what remains unresolved. |

## Runtime and method

| Document | What it covers |
|---|---|
| [mcp/dolphin-mcp.md](mcp/dolphin-mcp.md) | The Dolphin MCP: installation, the 35 tools, the capabilities and limits, the Riivolution descriptor traps, and the M0 gate evidence. |
| [experiments/README.md](experiments/README.md) | How an experiment is prepared, run and judged, and what counts as proof. |
| [findings/](findings/) | One record per claim, with its confidence (CONFIRMED / LIKELY / UNKNOWN), its evidence and its editable scope. Rendered with `cli.mjs findings render`; never edit the generated Markdown by hand. |
| [reports/](reports/) | Generated corpus reports over the level archives. |

## Gate state

`m0-status.json`, `m1-status.json`, `m2-status.json`, `m3-status.json` and `level-entry-status.json` are read by
the tooling — `node tools/ssa-archive/cli.mjs gates` prints them with their evidence. They stay at the root of
`docs/` because the code and the MCP server resolve those exact paths.

| Gate | State | Meaning |
|---|---|---|
| M0 | PASS | A driveable Dolphin with a proven Riivolution replacement. |
| M1 | PASS | An archive can be rebuilt and still load in game. |
| M2 | PASS | A single controlled value change produces the predicted effect. |
| M3 | PASS | A record can be instantiated by same-size replacement. |
| M4A / M4B / M5 | UNKNOWN | New assets, collision and gameplay are not validated. |

## Images

`images/` holds the few illustrations published with the documentation: the project logo, a capture of the
editor, and three in-game frames used as evidence in the README. Everything else stays local.

## Reusing this documentation

Everything under `docs/` and `specs/` is published under [CC BY 4.0](../LICENSE-DOCS): copy it, translate it,
build on it — and credit **PortalForge** (https://github.com/DEX-zha/PortalForge) with a link to the license,
saying if you changed anything. The code in `tools/` is [Apache-2.0](../LICENSE); keep its [`NOTICE`](../NOTICE)
with any redistribution. Neither license grants any right over the game's own data or trademarks.
