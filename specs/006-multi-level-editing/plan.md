# Implementation Plan: Multi-level editing

> Scope reviewed 2026-09-17: this feature records its original design and evidence. Later extensions and
> remaining work are mapped in the [specification status](../README.md); historical limits below are not the
> current editor limits.

**Branch**: `feat/006-multi-level-open` | **Date**: 2026-09-17 | **Spec**: [spec.md](spec.md)

## Summary

Open any of the 76 levels by name, from the command line and from the editor, with the extraction and decoding
done on demand; move objects on any level with the existing boot-proven writer and honest labels; switch levels
from the header without losing work by accident; keep objects and terrain readable on every level. No new
capability was promoted by the initial offline implementation. Subsequent Mining boots confirmed that
level’s position edits and redirect entry separately; see [validation](validation.md).

## Technical Context

- Node.js 24, ES modules, `node --test`; the editor server (`node:http`) and the browser view (Three.js, no
  bundler); DolphinTool for disc extraction; Edge headless over CDP for real-browser checks.
- Windows, SSA Wii SSPP52 Rev1; everything derived from the game lives under `.local/`.
- Inputs: 76 level archives already extracted under `.local/samples/DATA/files/level/` and decoded under
  `.local/workspaces/<name>-all/`; the tutorial runtime map `ptr-scan3-fixups.json`; the corpus report over all
  levels for placement counts.
- Cost measured before design: opening the largest level (Haunted Castle, 1 231 placements) takes about
  170 ms, decoding its meshes about 115 ms, and the mesh payload is 10 to 15 MB of JSON per level.
- Performance target: a switch is one request plus one page reload.

## Constitution Check

M0..M3 PASS; M4A/M4B/M5 UNKNOWN and untouched. Reading and transforming placements were already permitted
(FR-016); this feature widens where they can be applied and labels the widened scope LIKELY through a finding of
its own; later Mining transform evidence confirms that level only. No UNKNOWN file property becomes editable:
duplication still requires a runtime map. The original tutorial-only addition restriction is superseded by 007’s
experimental additions; direct entry now uses the redirect described in the quickstart. The individual source
test still uses the tutorial macro. Capabilities state these scopes separately. The game image is read-only; extraction writes under `.local/samples`,
decoding under `.local/workspaces`. Tests are written before the implementation they cover. The finding record
and this plan land in the same change.

## Phase 0 — Research

See [research.md](research.md): where the level list comes from, why the level entry is found by name, how the
runtime map is resolved, the inventory of tutorial-only checks and how each behaves on another level, the measured
extent inflation by parked objects and the threshold chosen, and the payload sizes.

## Phase 1 — Design

- `src/editor/level-catalog.mjs`: `levelCatalog()`, `findLevel()`, `suggestLevels()`, `runtimeMapFor()`,
  `configuredRuntimeMaps()`, `capabilitiesOf()`, `levelEntry()`. Pure derivation from the file system, the
  configuration and the findings; no game data parsed.
- `src/editor/level-open.mjs`: `ensureLevelWorkspace()` (extract, decode, materialise an uncompressed entry) and
  `openLevel()` (catalogue lookup, runtime map, `openSession`, `session.level`).
- `src/editor/server.mjs`: a switchable current session; `GET /api/levels`; `POST /api/open` with its refusals.
  The deps gain `levels()` and `open(query)`; `editorDeps(o)` no longer closes over one session.
- `src/cli/commands/edit.mjs`: `edit levels`, `edit open <level>`; `serve` keeps working on a file without a
  picker.
- `src/view/framing.mjs`: `levelExtent()` and `PARKED_GAPS`; `scene.mjs`, `preview.mjs` and `meshes.mjs` use it.
- `src/view/index.html`, `app.mjs`: the picker, the discard dialog, the capability rows, the parked tally.
- `tools/dolphin-mcp/config.mjs`: the `runtime_maps` setting.
- Contract: [contracts/levels-api.md](contracts/levels-api.md).

## Project Structure

- `specs/006-multi-level-editing/`: spec, plan, research, contracts, quickstart, tasks, validation.
- `tools/ssa-archive/src/editor/level-catalog.mjs`, `level-open.mjs`; changes in `server.mjs`, `session.mjs`,
  `meshes.mjs`, `preview.mjs`, `cli/commands/edit.mjs`, `cli/usage.mjs`, `view/*`.
- `tools/ssa-archive/tests/editor-level-catalog.test.mjs`, `editor-level-open.test.mjs`,
  `editor-open-route.test.mjs`, `browser-multilevel.mjs`; additions to `view-framing.test.mjs`.
- `docs/findings/records/level.transform.other-levels.json` (LIKELY), `docs/editor/roadmap.md` rewritten.

## Proof plan for SC-004

Two identical cold boots of one edited non-tutorial level, reached through normal play. Mining is the candidate:
it is the first story level after the tutorial, its workspace is decoded, and a runtime map for it would also
serve step 2. The edit is a visible static prop raised or moved by a distance a screenshot cannot miss; the
prediction is written before the boot; consumption is proven by the FileMon size line. No boot is started
without authorization. This was the initial plan; Mining was subsequently tested through the archive redirect
with lowered lanterns, twice. See [validation](validation.md) for the completed proof.

## Complexity Tracking

- Parked objects: a fixed threshold of three level-widths outside the 92% bulk box. Measured on seven levels, the
  parking constant sits at 93 to 114 widths and the shared switch templates at 1.07 to 7; distant islands and power
  gems sit at 0.9 to 1.7. A smaller threshold would have removed the hub's cave island from the framing; a larger
  one would have kept the templates of small levels in it. The tutorial parks nothing under any threshold.
- The catalogue reads only canonical `-all` workspaces, so experiment workspaces of the tutorial cannot be mistaken
  for a level. `edit serve` on any file is unchanged for the researcher who wants a specific copy.
- The mesh payload of a large level is 15 MB of JSON. It was 10 MB on the tutorial before this feature and is not
  changed by it; a binary payload is a separate improvement.
