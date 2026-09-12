# Phase 0 Research: IGZ v5 Level Object Model

Date: 2026-09-12. Built on the probes of feature 001 (`tools/ssa-archive/research-probes/probe-igz-*.mjs`) run on the decoded tutorial `level.bld` (30 935 720 bytes). Labels per FR-013 of feature 001.

## R1. Object header convention

- **Finding**: 21 680 objects match `{u32 type index < 224, u32 1, u32 0x01xxxxxx}` in section 1; type names resolve to Alchemy/TFB classes (tfbSpriteInfo 4 300, igIntKey 3 556, igVec3fList 2 456, ScriptSetReference 2 272, PlacementReference 704, ScriptSet 432, tfbActorInfo 15, ActorWaypoint 7, CameraInfo 15, tfbPhysicsModel 11 ...). LIKELY.
- **Decision**: enumerate objects by this header, bound each object by the next header, and report any region whose bytes are not covered as `unparsed` (type-52 chain nodes at 0x40 stride, inline float arrays, lists). Never guess sizes from the per-type size table until R2 confirms it.

## R2. Type table and sizes

- **Finding**: 224 NUL-terminated names from 0x834, including 22 empty entries (indexes 36..58, 223); a u32 array starts at the 4-aligned end (0x14E0): 0xC, 0, 0, 0xA4, 0x2A8, 0x18 ... UNKNOWN meaning (instance sizes?).
- **Decision**: correlate `sizes[type]` with the measured distance to the next object per type (tfbSpriteInfo 0x4C, igIntKey 0x48, ScriptSet 0x50, PlacementReference 0x1A0 or 0x68 ...). If the correlation holds for most types, sizes become LIKELY and let the inspector separate an object from its trailing inline data.

## R3. String references

- **Finding**: u32 values interpreted as offsets relative to section 2 (0x4579C0) land on string starts 36 392 times versus 1 for absolute or section-1-relative interpretations. Value 0 points to the first string (`Levels/Level_027/027_ART_MASTER.ma`) and must be treated as null. CONFIRMED for the interpretation, LIKELY for "every such word is a reference".
- **Decision**: `refs.mjs` resolves S2-relative strings with 0 = null, and reports the field offset so patterns per type can be learned (e.g. PlacementReference +0x8 texture path, +0x24 "Scene Graph").

## R4. Object references

- **Finding**: section 1 starts with `0 0 0 0xB32 | 0xB32 0x80002CC8 0x1C 0x2CE4` then a list of section-1-relative offsets at 0x40 stride (type-52 nodes at 0x123598 ...); pointers with bit 31 set appear both in that header and inside objects (`0x80000000`, `0x800001A7`, `0x80000004`). UNKNOWN whether the flag means "section-relative pointer", "external" or "null-terminated list".
- **Decision**: treat plain words that fall on an object header as object references (LIKELY when the target has a valid header), and record flagged words with their low 24 bits as candidates; test both on the 2 866-entry list.

## R5. Entities found so far

| Record | Location | Result |
| --- | --- | --- |
| tfbPhysicsModel @0x1A76EC | +0x94 f32be x,y,z (91.73, 10.31, 44.74), +0xA4 161.0; second position +0x1FC | **CONFIRMED** spawn position: +8 on X moved the Skylander in 3/3 runs |
| ScriptSet @0x35191C | +0x6C (92.39, 11.78, 42.52), 5.0, 261.0, 5.0 | negative: no effect in 2/2 runs; UNKNOWN (trigger? camera?) |
| ScriptSetReference pairs | +0x40 / +0x4C triples around the spawn (e.g. (91.27, 3.22, 43.18)-(95.43, 8.17, 46.57)) | LIKELY trigger boxes (min/max) |
| PlacementReference +0xB0 | multiples of 1.524 (300 ft, 150 ft ...) | dimensions, not positions |

- **Decision**: candidate entity fields are ranked by proximity to a live position (R6) and by not being feet-derived dimensions or min/max pairs; each becomes a finding before any run.

## R6. Live-to-file matching method (worked for M2)

- `ram-diff` (state slot 6 with the figure loaded) yields reversible world-scale triples: the Skylander position lives at three MEM1 addresses; section-1 bytes are resident at `0x80DBC020 + file offset`.
- **Decision**: `match.mjs` maps a RAM address or pattern to `(object, field)` using the section base and the object graph; entities that move (Hugo walks during dialogues, chompies) can be located the same way; static props need an archive mutation.

## R7. Duplication constraints

- Cloning appends bytes to section 1 and changes the object list count (0xB32) and possibly the type-52 chain; the 0x01xxxxxx ids may need to be unique; string table can be reused; section offsets after section 1 shift (header table), and the re-encoded `level.bld` may change its LZMA chunk count, which the IGA writer currently refuses (`REENCODE_CHUNK_COUNT_CHANGED`).
- **Decision**: (1) extend `writer.mjs`/`decode.mjs` to grow the multi-chunk u16 table (header words 0x08 and 0x24, table area, all entry starts relaid); (2) implement `clone.mjs` as a plan: copy record, patch fields, append, update the object list and any list that references the source by index, update the section table; (3) validate with the inspector (100 % accounting, references resolve) before any run; (4) first M3 attempt clones the CONFIRMED tfbPhysicsModel record with +X, predicting two spawn candidates (observable as a second physics body or as the spawn moving to the clone).

## R8. Alternatives considered

| Alternative | Reason rejected |
| --- | --- |
| Port igArchiveExtractor IGZ code | Handles versions 6+ with tagged fixups; version 5 offsets table is empty |
| Full Alchemy class reflection (igMetaObject) | Not observable in v5 files; findings-driven field maps suffice for M3 |
| Skip the inspector and keep matching raw floats | Worked once for M2 but cannot support duplication or safe multi-field edits |
