# Study of the ground and platforms missing from the editor

Study of 14 September 2026, based on `editor=chat=session.txt`, on the current code and on the local archives.
Finding: `igz.geometry.editor-coverage` (**LIKELY**, not editable).

## Fix applied

The editor now displays the tutorial's 1 584 scenery chunks and Mining's 641 through a separate
path, in world coordinates, under the **Scenery · read-only** layer. Chunks already associated
with models are excluded from that path; unresolved separate assets stay out of the rendering.
The analysis paragraphs below describe the state **before** this fix.

The API exposes `scenery` and `unresolved` alongside `models`. Blocks are grouped in batches to limit
draw calls, keeping their descriptor identifiers. Scenery never enters the list of selectable
placements and receives no object transform. The counters explicitly distinguish decoded blocks,
blocks associated with models, blocks served as scenery, and blocks still unresolved.

The first WebGL test showed a grey screen: background surfaces that had become opaque were hiding the level.
Surfaces whose extent exceeds half that of the placements (minimum 32 units) are now drawn as wireframe by
default. The **Solid large surfaces** setting restores their solid rendering.
This treatment also applies to large placed models and is not a semantic identification
of the sky or of the materials. Framing stays centred on the placement area, without letting those backgrounds
drive the zoom. The CLI preview also includes scenery when `--meshes` is requested.

The browser tests use a headless Edge instance with an isolated profile under `.local/`:
real display of the tutorial and of Mining, the Scenery layer, All/None, wireframe, selection of a real model,
moving its instance without changing scenery vertices, and rebuilding the scene without duplicates.
Captures and results are in `.local/mesh-coverage-study/browser-tutorial-bld/` and `browser-mining-bld/`.
No original archive is modified and no geometry/collision editing capability is added.

Validation of the fix: **219 tests pass**, with no failure and no skipped test. The new audit of the 76 archives
still walks 126 920 descriptors; it serves **92 705 extra blocks** as scenery and keeps
1 942 blocks unresolved (1 478 of them interleaved with a stride other than 6). Their coordinate space
needs validation before including them. The full report is `.local/mesh-coverage-study/corpus-after.jsonl`.

## Result

The main cause is an omission between decoding and display. The decoder already reads the static scenery
chunks, but the editor only forwards and draws the meshes associated with placed objects.
A large part of the ground, the buildings and the platforms built into the scenery does not take that path.

The session's "210 models out of 210" describes the coverage of the models referenced by the placements.
It measures neither the coverage of all the level's geometry nor the fidelity of each model.

## Reproduced measurements

| Measurement | Tutorial | Mining | 76 local archives |
|---|---:|---:|---:|
| Decoded geometry blocks / descriptors | 2 264 / 2 264 | 925 / 925 | 126 920 / 126 920 |
| Distinct blocks associated with placed models | 677 | 279 | 32 273 |
| Decoded blocks absent from the geometry sent to the view | 1 587 | 646 | 94 647 |
| Of which interleaved-attribute blocks, scenery candidates | 1 584 | 641 | 94 183 |
| Of which separate-array blocks, to be examined separately | 3 | 5 | 464 |
| Placed models with at least one mesh | 210 / 210 | 134 / 134 | 11 199 / 11 269 |

About 70 % of the tutorial's blocks and 75 % of the blocks of this 76-archive sample are therefore omitted.
These percentages are about source blocks, not about the surface visible on screen or the rendered instances.
The session's historical figure covered 112 files: this new audit does not claim to reproduce that scope.

In the tutorial, the omitted units hold 252 075 vertices and 314 994 triangles.
In Mining, they hold 245 650 vertices and 207 334 triangles.
The pointer map already captured in Dolphin (`ptr-scan3-fixups.json`) gives the same counts on the
tutorial as the structural analysis. A missing runtime map therefore does not explain this omission.

Beware of the `owned` counter: it sums the associations between models and blocks. A shared block may
appear in it several times. In the tutorial: 778 associations, but only 677 distinct blocks.

## Where the data disappears

1. `src/igz/gxmesh.mjs`, `decodeGeometry`: produces every decoded block, scenery included.
2. `assignUnits`: looks for a placed model for each block, with a bounding-box filter.
   With no association kept, it increments `world` and then leaves the block's processing.
3. `src/editor/meshes.mjs`, `modelMeshes`: concatenates the blocks of `byModel` only.
4. `meshesPayload`: returns `{ stats, models }`. The number `stats.world` is kept, but no corresponding
   geometry is serialised.
5. `src/view/scene.mjs`, `build`: creates instances from the placements and their model.
   There is no rendering branch for scenery without a placement.

The `src/...` paths above are relative to `tools/ssa-archive/`.
Changing the camera or turning layers on cannot display vertices that are absent from the API response.
Likewise, `stats.complete = true` says that the decoder's walk did not stop early; it is not
an indicator that the displayed scene is complete.

## Local visual check

Two wireframe previews were produced with the same data and the same camera, near the start of the tutorial:

- [.local/mesh-coverage-study/placed-only.png](../../.local/mesh-coverage-study/placed-only.png): current path, placed objects only.
- [.local/mesh-coverage-study/with-world-candidates.png](../../.local/mesh-coverage-study/with-world-candidates.png): adding the 1 584 unassociated interleaved blocks, with no placement transform.

The second preview brings back the island terrain and the windmill building under the blades that were
already there. That supports reading those blocks as scenery already expressed in world coordinates.
This experimental preview is computed outside the browser, with no material handling and no correct
surface occlusion. It is not a new in-game validation and does not change the editor.

## Why "display everything that is left" would be wrong

- `world` really means "no placed model kept". The tutorial's three separate blocks (#1593–1595)
  carry references to the interface Wiimote textures. They must not become terrain at the origin.
- Mining also leaves aside two separate blocks (#650–651) tied to ore-processing assets.
  Attaching and transforming them needs further study; placement detection
  does not necessarily cover every animated or script-created asset.
- Two interleaved tutorial blocks (#360 and #583) are already associated with `water_transition_dome.mdl`.
  Adding every interleaved block indiscriminately would draw them a second time. That attribution remains
  the current heuristic's, with no new evidence of its correctness in this study.
- `boundsIn` looks for an attribute over 0x400 bytes without stopping at the next header. The boxes found
  that way may belong to a neighbouring record: on their own they do not prove ownership of a chunk.
- The visible mesh and the collision are two distinct pieces of data. Seeing a platform does not prove that
  the character can walk on it, and moving the visual does not automatically move its collision.

## Recommended technical follow-up

Add a read-only scenery rendering path, with descriptor identifiers and distinct counters:
decoded blocks, associated blocks, rendered scenery candidates, unresolved blocks and any early stop.
The unassociated interleaved candidates form a first experimental set; their format alone does not
prove the engine's visibility or activation rules.

These chunks must receive only the common axis conversion once their world coordinates are
established, without applying a second placed-object translation, rotation or scale. A "Scenery" layer must
allow hiding them. Framing, large background surfaces and object selection must be
checked with this new content. The placement path keeps its current transforms and editing.

Then handle the remaining assets through their scene graph, their scripts or their skeleton, rather
than placing them arbitrarily at the origin. Check at least the tutorial and Mining, the absence of duplicates,
the interface/scenery separation, and that selection and movement still work.
Geometry and collision editing stays subject to the M4A/M4B gates; this study does not change them.

## Reproduction and scope

From the project root:

```powershell
node tools/ssa-archive/research-probes/probe-mesh-coverage.mjs .local/workspaces/tutorial-bld/entries/3-level.bld.decoded .local/workspaces/mining-bld/entries/3-level.bld.decoded
node tools/ssa-archive/research-probes/probe-mesh-coverage.mjs .local/workspaces/tutorial-bld/entries/3-level.bld.decoded --fixups .local/dolphin-evidence/ptr-scan3-fixups.json
```

The script emits one JSON line per file, with a SHA-256 digest, counts, walk stops and examples
of omitted blocks. Since the integration it distinguishes `unassigned` (no placed model), `scenery` (served as
scenery) and `omitted` (still absent from the rendering); the earlier JSON files remain the evidence of the initial state.
The counts are compared with the result of the current API function. The game files are
read only. The reports, the preview script and the images stay in `.local/mesh-coverage-study/`.

The Dolphin status consulted still reads M0 PASS, but no bridge was active (`ECONNREFUSED`, no owned PID).
No new in-game experiment was run. The format conclusions stay LIKELY and not editable;
the API omission is directly observable in the code and reproduced by the local measurements.

Final checks: `npm test` in `tools/ssa-archive` passes 212 tests, with no failure and no skipped test;
`findings validate` validates the 60 records; `git diff --check` reports no error.
