# Research — 2026-09-15

## Local duplication

planReplaceRecord works inside a single buffer and relocates internal references only. Keep applyReplace / replacePlacement; an existing slot of the same size is mandatory. Shared models force a plan and acknowledgements. A candidate that matches in size does not guarantee a valid plan. Scripted/inactive sources stay readable but cannot be dropped. Inserting records would shift the loader's walks, which is outside M3.

## Cross-level import

Type indices are file-specific; parsed names are not reliable as identity. The .mdl path is not enough. Close the dependencies: placement, companions, chains, models, references, GX tags 44/51, materials/textures tag 31, global handles, scripts, Havok collision 25, animation 65 and FSB4 audio. gxmesh.assignUnits also uses spatial heuristics and does not prove that closure. Global handles are partly unknown; the IGA writer does not create new entries.

Decision: a read-only external catalogue, then a report of local_reuse_candidate / new_resources_required / unresolved_dependencies / no_compatible_slot / runtime_map_required. Reuse copies an instance of the target only. A real import starts with static decoration after M4A; collision M4B and scripts M5 stay separate.

Evidence: an asset absent from the original target, transplanted bytes/references identified, construction/rendering observed over two boots and the other users checked. A local reuse is not an import.

## Direct loading

editor/dolphin-run.mjs automates the tutorial only, by walking through the menus. dolphin_load_state returns load_scheduled without proving the level. A state restores RAM: the original slot 6 can hide the patch.

Prefer a state taken before the transition, then prove a fresh read after restoring. Resuming into an already loaded scene is only a cache tied to the state/game/runtime/configuration/patch/sources hashes. Any change invalidates it; restoring that cache is not new proof of consumption.

No engine API for level selection has been confirmed. The strings "load to level" and "champion level load" are UNKNOWN leads, with no opcode identified. Search the DOL and the references before any write.

Protocol: starting identity, confirmed patch, dedicated instance, restore/transition, new log bound, target identity + distinctive FileMonitor size or RAM + visible modification + playable Skylander. Two identical boots; extend to Mining then to another family and keep a per-level matrix. No silent tutorial fallback.

Sources: docs/mcp/dolphin-mcp.md, docs/format/iga-v4.md, docs/format/igz-level-editing.md, docs/experiments/README.md; findings igz.types.per-file-indices, igz.placement.shared-model-record, igz.flagged-word.global-handle; src/igz/{relocate,gxmesh}.mjs; src/editor/{session,dolphin-run}.mjs; tools/dolphin-mcp/server.mjs.
