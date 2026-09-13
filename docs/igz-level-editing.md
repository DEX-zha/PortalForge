# IGZ level editing — placements: move and duplicate (visible)

Status 2026-09-13. Applies to `level/Level_027_Tutorial.bld` entry 3 (`level.bld`, IGZ v5, big-endian) of
Skylanders: Spyro's Adventure (Wii, SSPP52 PAL rev1). Everything below is backed by findings in
`docs/findings/records/` and experiments in `docs/experiments/README.md`; the confidence label of each
statement is the label of the finding it comes from.

## 1. What a visible prop is in the file (CONFIRMED: `level.prop.scriptset-placement`)

The tutorial island is baked geometry. The visible *dynamic* props near the spawn (two sunflowers, a weed)
are **placement records** embedded in scripts:

```
type-111 "ScriptSet" wrapper (opcode text at +8: "set [set]||to")      sizes seen: 0x140 0x198 0x1C8 0x1D4 0x1E4 0x1F4 0x378
  +0x00 type (111)      +0x04 refcount (1)      +0x08 opcode string (section 2)
  +0x1C -> shared type-112 record (template class: refcount 10 for plants, 7 for push blocks, 36 for CS_ markers)
  +0x24 +0x3C +0x44 +0x10C   internal pointers (into the record itself)
  +0x48 embedded type-104 record  <-- THIS offset is a header-table entry, named like the placement
  +0x50 name (section-2 string)            e.g. "sunflower_Template(1)", "Push_Block_Template(1)", "CS_PortalEntry01"
  +0x6C f32 x, +0x70 f32 y, +0x74 f32 z    world position
  +0x7C f32 heading (degrees)
  +0x100 f32 scale (100 = 1.0)
  +0x174 f32 x3 physics bounds (e.g. 10,10,3)
  0x1C8 variant (plants with inline model): +0x1A0 model path string ("C:/tfb/Content/Models/Objects/plant_sunflower_whole.mdl"),
        companions +0x128 (igNodeList, t66) +0x1AC (ScriptSetReference, t65) +0x1B0 (t66) +0x1B8 (t67)
  0x1E4 variant (model by reference): +0x124 -> type-64 record (refcount 3), +0x128 internal
  0x198 variant (CS_ camera markers, push blocks): no companions; push blocks add +0xF0 -> type-92 behaviour script
  0x140 variant (PushBlock_Mabu): +0xF0 script, +0x10C t67, +0x124 t64, +0x128 t66, +0x12C t147
```

Pointer fields above are the words the game rewrote in RAM (fixup map `ptr-scan3-fixups.json`), not
heuristic guesses. All 30 positioned type-111 records of the file are listed by the scratch inventory
(`igz script <record> --fixups …` shows them per script); 3 are plants, 18 are cutscene camera holds
(`CS_*`), 3 are push blocks, the rest are level-end / gate markers.

## 2. Move a prop (M2-style, in place)

Edit the three floats at `+0x6C` of the wrapper (the same bytes as `+0x24` of the embedded type-104 record).
Nothing else changes; file length unchanged. Demonstrated on `sunflower_Template(2)` (0x1E4 variant)
in run `m3-level_027_tutorial-e3-1789304824550`: the plant stood where the new triple said.

## 3. Duplicate a prop: same-size replacement (`igz clone-entity --replace-record`)

Never insert, never grow the header table (rules in `igz.loader.head-span-count-walk`,
`igz.loader.blob-walk-stomps-insertions`, `igz.loader.relocation-table`). Instead **sacrifice** a record of
the same type and the same size and copy the source over it:

```
node cli.mjs igz clone-entity <level.bld.decoded> <source> --end <source+size> \
  --fixups .local/dolphin-evidence/ptr-scan3-fixups.json \
  --finding level.physicsmodel.spawn-candidate --also-finding level.prop.scriptset-placement \
  --replace-record <victim> --keep <hex field list> \
  --set 0x6c=<x> --set 0x70=<y> --set 0x74=<z> \
  --out <out.decoded> --plan <plan.json>
```

What the planner does (`planReplaceRecord`, `src/igz/relocate.mjs`):

1. refuses unless source and victim are object headers of the same type and size;
2. copies the source bytes over the victim, sets refcount 1;
3. rebases pointers that point *inside* the source to the victim (from the fixup map);
4. copies external pointers and bumps the refcount of their targets (`igz.object.refcount`);
5. `--keep` fields (hex offsets) retain the **victim's** words: keep `+0x50` (the name stays unique — scripts
   look actors up by name) and the victim's companion pointers (its ScriptSetReference / igNodeList records
   stay attached to the slot; the source's companions stay attached to the source);
6. applies `--set` edits on the copy (position, heading, scale);
7. validates: file length unchanged, no byte changed outside the victim except the bumped refcounts, the copy
   is recognised at the victim slot, graph still clean.

Recipes used so far:

| Source | Victim (slot) | keep | Result |
| --- | --- | --- | --- |
| `sunflower_Template(1)` 0x34959C | `weed_2_Template(8)` 0x34AC18 | `50,128,1ac,1b0,1b8` | three sunflowers (2 identical boots, CONFIRMED) |
| `weed_2_Template(8)` 0x34AC18 | `sunflower_Template(1)` 0x34959C | `50,128,1ac,1b0,1b8` | a weed where the sunflower stood (1 boot) |
| `Push_Block_Template(1)` 0x232258 (script Remove_Stuf_at_start.ai) | `CS_Closing01a` 0x2D2844 (script 027_Level_End_Temp.ai) | `50` | G2, see experiments index |

Then rebuild and boot: `experiment m3 --archive level/Level_027_Tutorial.bld --entry 3 --plan <plan.json>
--file <out.decoded> --predict "…" --repeat 1 --skip-control --figure <.sky>`; judge with
`experiment m2-judge --id <id> --run 1 --observed "…" --match yes|no`. A second boot of the byte-identical
rebuilt archive can be counted with `--replicates <first id>` (SC-004: same input, twice).

## 4. Limits (honest)

- Duplication **consumes a slot**: the victim disappears. Candidates for sacrifice in the tutorial: the 18
  `CS_*` camera markers of cutscenes you do not need, the level-end markers. Growing the number of records
  is a separate, unexplored chantier ("duplication sans sacrifice").
- Size classes must match exactly (0x1C8 plants can only replace 0x1C8 plants; 0x198 replaces 0x198).
- Selection must use the header table and runtime-confirmed pointer words (`igz fixups`) — the heuristic
  header detector produces hundreds of phantom records (`igz.detection.heuristic-limits`).
- The fixup map exists only for the tutorial level; another level needs its own `experiment ptr-scan`
  boots (2) before the planner can trust its pointer fields — or a per-(type,size) field template derived from
  the tutorial, still to be validated.
- Instances that share a behaviour script (`+0xF0`) share the script record (refcount bumped): per-instance
  script variables are untested.

## 5. Why earlier attempts froze (for the record)

Appending or inserting records shifts the count-bounded head walk or gets stomped by positional blob walks;
growing the header table desyncs relocation; type-92 records are compiled scripts (singletons), never
duplicate them. Full history: `docs/experiments/README.md` and the `igz.loader.*` findings.
