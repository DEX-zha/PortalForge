# ssa-archive — SSA Research Toolkit

Node.js library and CLI for the PortalForge research gates M1 (archive round-trip) and M2 (controlled world mutation) on Skylanders: Spyro's Adventure Wii (`SSPP52`). Design: `specs/001-ssa-level-research/` (plan, research, data model, contracts, quickstart, tasks).

## Gate rule (FR-015)

No editor, viewport, import, object-creation or menu-expansion code lives in this package until `docs/m1-status.json` and `docs/m2-status.json` both read `PASS`. Until then the toolkit only inspects, extracts, verifies, rebuilds, diffs, patches and runs experiments. Findings with confidence `UNKNOWN` or `LIKELY` are never exposed as editable properties (FR-013).

## Rules of the road

- The original WBFS is opened read-only, always through `DolphinTool.exe`; the user's own Dolphin 2606a is never driven.
- Game-derived files (samples, workspaces, patches, evidence) stay in `.local/` which is git-ignored (FR-017).
- A booting patched game proves nothing by itself: consumption is measured with Dolphin's file monitor or a memory read (see `docs/dolphin-mcp.md`).
- Descriptor paths use forward slashes; Dolphin splits the XML path on `/` only.

## Usage

```powershell
cd tools/ssa-archive
npm ci --ignore-scripts
npm test
node cli.mjs --help
```

Commands and JSON shapes: `specs/001-ssa-level-research/contracts/ssa-archive-cli.md`. Validation scenarios: `specs/001-ssa-level-research/quickstart.md`.

## Layout

- `cli.mjs` dispatcher, `src/cli-commands.mjs` user-story commands.
- `src/iga/` header, reader, chunks, decode (LZMA), writer, verify, diff.
- `src/disc/` DolphinTool wrappers (identify, list, extract). `src/workspace/` manifest. `src/patch/` Riivolution workspace.
- `src/research/` float/string scanners, bindiff, findings records and rendering, categories.
- `src/experiments/` MCP-driven runs: `run-game.mjs` (session helpers, input scripts), `explore-entry.mjs`, `m1-roundtrip.mjs`, `m2-mutation.mjs`, `live-probe.mjs`; `input-scripts/level-027-entry.json`.
- `research-probes/` one-off diagnostics that produced the findings in `docs/iga-v4.md` (header words, chunk tables, LZMA, IGZ sections/objects, header survey). They read `.local/samples` and are kept as reproducible evidence, not as library code.
- `tests/` `node --test`: synthetic archives (no game data) plus fixture tests that skip when `.local/samples` is absent.
