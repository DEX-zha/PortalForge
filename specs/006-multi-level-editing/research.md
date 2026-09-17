# Research: opening and editing every level

## Where the level list comes from

All 76 level archives of SSPP52 Rev1 are already extracted under `.local/samples/DATA/files/level/` and decoded
under `.local/workspaces/<lowercase name>-all/` (`extract --decode`). Every one of them holds its level as entry
index 3 named `level.bld`, between six language `.pak` entries. The index is not assumed anyway: the entry is found
by name in the manifest, and an uncompressed entry is accepted as its own decoded form so a synthetic archive can
exercise the same path in tests.

Two workspaces hold the tutorial, `tutorial-bld` and `level_027_tutorial-all`; their decoded level entries are
byte-identical (SHA-256 `2976f3597df5f7aa…`), as are the two Mining workspaces. The catalogue uses the canonical
`-all` name and ignores every other directory, so the m1/m2/m3 experiment workspaces of the tutorial, which also
carry manifests, can never be listed as levels.

`docs/reports/placement-corpus-all-levels.json` (2026-09-13) gives the placement count of every level; the picker
shows it. Title has 0 placements and Credits 59; the corpus opened all 76 files.

## Runtime maps

Only the tutorial has a runtime map (`ptr-scan3-fixups.json`). A map is what allows duplication: it says which
words are pointers. The resolution order is configured (`runtime_maps` in `.local/dolphin-config.json`, a JSON
object from disc path to file, or the same as text in `PORTALFORGE_RUNTIME_MAPS`), then
`.local/dolphin-evidence/runtime-maps/<name>.json`, then the historical tutorial file. Step 2 of the roadmap will
write maps into the folder; nothing else has to change for the editor to pick them up.

## What assumed the tutorial, and what each does on another level

| Where | Check | On another level |
|---|---|---|
| `editor/levels.mjs` | `isTutorial`, `ORIGINAL_TUTORIAL_SHA256` | the single place the others read |
| `editor/dolphin-run.mjs` | `mode === 'test'` requires the tutorial | refused with a message; normal play works |
| `editor/level-entry.mjs` | direct entry and skip-intro require the tutorial | refused; the view disables the modes |
| `editor/addition-compatibility.mjs`, `native-additions.mjs` | Add requires the tutorial and its runtime map | every source is Blocked, `0 can add` |
| `editor/addition-probe.mjs` | family tests require the original tutorial bytes | refused |
| `editor/scene-roles.mjs`, `scripted-startup.mjs`, `scripted-previews.mjs` | keyed on `Level_027/Scripts/Bridge_Spawner.ai` | empty lists: no preview, no disabled-template layer |
| `view/app.mjs` | `state.tutorial` from the archive name | launch mode forced to play, skip-intro disabled |

None of these needed a change: they refuse or return nothing, which is the honest behaviour. What was missing was
a single place that says so, which is what the capability object per level is.

## Objects and terrain on other levels

Headless previews with meshes (`edit preview --meshes`) of Mining, Haunted Castle, Hub stage 1, Challenge 005 and
Dark Forest, 2026-09-17, under `.local/level-check/`. Objects sit on the decoded scenery in all five. Two things
stood out.

**Parked objects inflate the extent.** Haunted Castle reported an extent of 31 299 units with 284-unit proxies and a
5 000-unit grid. Six boss levels (Lumberjacks, Stone Golem, Mine Train, Island Escort, Haunted Castle, Final
Battle) place `BossCamera`, `PhaseDirector` and `EvilPortalMaster` at (30480, 30480, 30480), which is 100 000 feet
in metres; several levels keep a shared set of switch templates (`Spike_Floor_Spawner_For_Switch`,
`Hole_For_SwitchTypeSpawner`, `ButtonSpawner`, `Block01`, `Kill_Block`) near (30, 0, -815). Measured as the gap
outside the 92% bulk box divided by the bulk's longest side:

| Level | Bulk span | Farthest real content | Parked templates | Parking constant |
|---|---:|---:|---:|---:|
| Haunted Castle | 327 | 0.64 (props) | 1.67 to 2.26 | 93.3 |
| Hub stage 1 | 217 | 1.28 (cave island) | none | none |
| Troll hub | 238 | 0.71 | 3.11 to 3.13 | none |
| PvP Spikes | 104 | 1.69 (power gem) | 7.01 | none |
| Castle | 351 | 0.14 | 1.83 to 1.85 | none |
| Lumberjacks | 266 | 1.12 (portal VFX) | none | 114.4 |
| Dragon Expansion | 509 | 0.90 (flying boulder) | 1.07 to 1.08 | none |

The threshold is three widths: it removes the parking constant everywhere and the templates of small levels,
keeps every distant island and power gem, and leaves the tutorial untouched (it parks nothing under any
threshold; its extent stays 489). Levels whose templates sit under three widths keep them in the extent, which
costs a proxy at most twice the ideal size; Haunted Castle goes from 31 299 to 1 175 units. The rule is
`levelExtent` in `view/framing.mjs`; the count is shown in the tally and in `edit preview`.

**Proxies on big levels are small.** Hub stage 1 (558 units, 597 placements) frames its proxies at 3.4 px median
in proxy-only mode; with meshes the picture reads correctly. This is the existing trade-off of one proxy size per
level and is not changed here.

## Payload sizes

| Level | Placements | Open | Meshes | Mesh payload |
|---|---:|---:|---:|---:|
| Haunted Castle | 1 231 | 170 ms | 114 ms | 14.9 MB |
| Hub stage 1 | 597 | 85 ms | 75 ms | 13.8 MB |
| Mining | 617 | 75 ms | 59 ms | 10.2 MB |

A switch is one request and one page reload; the browser scenario switches three times in under a minute on the
reference machine, including thumbnails.

## Landing in the chosen level: why the archive redirect

Three routes were weighed for "Patch loads the chosen level":

- **A pre-load checkpoint per level**, the tutorial's own method: needs, per level, a save where the level is
  unlocked, a navigation macro from the hub to the level gate, and a checkpoint taken just before the transition
  input. Expensive per level and dependent on the user's save.
- **Forcing the level from memory**: find the "next level" field the slot screen holds and poke it before the
  transition. Unknown addresses; a research task with no cheap experiment.
- **The archive redirect**: the game asks for `level/Level_027_Tutorial.bld` and `.arc` after the confirmed
  checkpoint; serve the chosen level's pair under those names. Reuses the confirmed checkpoint code unchanged,
  costs one screening boot, and is generic over the 76 levels. Its risk is code outside the archives expecting
  tutorial content (the opening controller script, engine flags, assets keyed by level id in `Title.arc` or
  `global.arc`).

The redirect was implemented as an experimental launch mode. The tutorial `.arc` was inspected: an uncompressed
IGA of 477 voice files in six languages, which is why the pack is redirected with the archive rather than left
in place. The checkpoint binding hashes `[disc path, size]` of every replacement, so a redirect layout gets its
own checkpoint folder; whether the rebuilt `.bld` size is stable across edits of one level decides whether that
preparation happens once per level or once per patch (see validation).

## Choosing a prop the opening camera sees

The redirect macro captures the level's opening as the game plays it, so a transform proof needs a prop inside
that camera's view. On Mining the opening cutscene plays around (86, 12, -45): the cutscene cameras `CS_Opening01`
(90.2, 16.7, -44.3), `CS_Opening02` (89.4, 12.8, -53.2) and `CS_Opening03` (64.2, 16.1, -46.4), the Molekin actors
of the closing cutscene at (86 to 91, 11 to 12, -40 to -48), `Lantern_01` at (84.9, 16.1, -37) and
`Lantern_01(1)` at (82.4, 16.0, -54.3), the amethyst on the cart at (84.9, 13.3, -60.2). Every modelled placement
within 25 units carries a behaviour script except `MineTrain` at (99, 12.6, -45.9), behind the camera. The emerald
of the first two runs sits at (2.7, 4.6, 0), out of view. The lanterns run `Lantern_Generic.ai`, a light script
with no track dependency, and one of them hangs in the top-left of every capture: both were lowered by 5 units
for the transform runs, and the effect is judged by `shot diff` between the emerald and the lantern captures.

## Objects that looked misplaced: stored templates and inactive records

After the redirect proofs the user reported objects "misplaced in general" on Mining: `Rock_Breakable_Half`,
`Switch_90_Art_Template`, `Mine_Train_Template` and others. They are not misplaced; they are stored. The word at
+0x54 of every placement record is exactly 4 or 5 on both levels measured, and bit 0 is the whole difference:

| Level | Class | Placed (4) | Template or inactive (5) | In a `.lvl` layer | Both |
|---|---:|---:|---:|---:|---:|
| Tutorial | 104 | 377 | 296 | 283 | 205 |
| Mining | 98 | 381 | 236 | 240 | 209 |

Every object the user named has the bit set, together with `Rock_Breakable_Quarter` and `_Full`, `Rock_Bit_1`,
`OilCan_Icon`, `Elemental_Gate_Template` and the rest of the `GameElement_*.lvl` libraries; `MineTrain`,
`Lantern_01`, the mining walls and the Automaton parts have it clear. The `.lvl` layer is a related but distinct
signal: 27 flagged records sit outside any library (cutscene actors, triggers, a rescued miner, all inactive until
a script activates them) and 31 library members are placed with the bit clear (the Automaton's parts near the
opening scene). The bit is what the tutorial's "Templates and disabled objects" layer already used, but
`scene-roles.mjs` tested the tutorial's class index 104 and the presence of `Bridge_Spawner.ai`, so it returned
nothing on any other level. It now uses the class detected for the file and no script gate: Mining gets its 236,
the tutorial keeps its 296, and the bridge and cannon previews stay tutorial-only. On the editor those records
move to the hidden layer and to Project → Resources, with the counterpart link when a placed twin exists.

Read in the running game (`research-probes/instance-probe.mjs`, run `editor-direct-play-1789652048727-d8dbe468`):
Mining reached through the redirect, the resident section found at `0x80dc6f48` by searching MEM1 for a stored
position triple and checking a second one. Every record is constructed with the class pointer `0x80481674`.
The three placed controls (`MineTrain`, `Lantern_01`, `MiningWall_1(3)`) read state 1 with an actor pointer;
the nine stored records, the user's three included, read state 5 with no actor, still at their storage
coordinates; `Automaton_Head` and `Spring`, stored 4, read state 2 with no actor: placed, not yet activated.
Finding `igz.placement.inactive-flag`, LIKELY on the tutorial's earlier comparison plus this read.

## Does the editor show the level before its opening plays? Measured: no

The user's impression was that the view shows the level as it is before the opening cutscene, with objects the
scripts then move. The all-placements probe (`instance-probe.mjs --all`, run
`editor-direct-play-1789654775395-b54788b7`, 2026-09-17 14:21) read every one of Mining's 617 records in MEM1 at the
first playable frame, after the opening:

| Stored word | Runtime state | Count | Meaning |
|---|---|---:|---|
| 4 | 2, no actor | 313 | placed, dormant: the game activates objects by distance |
| 5 | 5, no actor | 236 | stored templates and inactive records, never instantiated by themselves |
| 4 | 1, with actor | 60 | active around the player |
| 4 | 3, no actor | 8 | one-shot initialisers that ran and finished (`_Level Definition`, `LootSystem_Init`, `_FoodInit`, `StoryTablet_17`…) |

Objects whose current position differs from their stored one by more than half a unit: **3** of 617
(`Push_Block_Template(13)` and `(29)` on their tracks, 13.7 and 4.6 units, and `Legendary_Treasure_GoldenLinks(1)`
raised 1.8); stored positions rewritten by the game: 0. The positions the editor draws are the positions the game
uses for the other 614. What makes the view hard to read is therefore not a pre-cutscene state; it is what is
missing or how it is drawn.

**The script layer is tutorial-bound by class index.** `src/igz/script.mjs` selects scripts with
`readUInt32BE(e) === 92`, the tutorial's index, and `script-diagnostics.mjs` reads the list and instruction
records by the tutorial's indices too. On Mining `igz scripts` reports zero scripts, so the clone catalogue, the
movement diagnostics and the resource navigation are empty on every level but the tutorial, silently. This is
the same defect the placements had (`igz.types.per-file-indices`) and the reason the objects a level clones at
its controllers (track switches, cannon parts, breakable-rock halves) appear nowhere in the editor once the
templates are hidden. The class can be detected structurally on every level from the behaviour pointer at +0xA8
of any scripted placement, which lands on a script record; the instruction kinds can be told by their opcode
strings ("clone||at|facing||cloned") rather than by index. Doing so unlocks the clone previews the tutorial has
for its cannons on every level.

## A more faithful view: what the archive holds for textures, lights and effects

Asked whether textures and VFX in the editor would be a good idea, the inventory of Mining's level entry (the
same nine sections on every level, `igz.sections.roles`) gives the scale:

| Data | Where | Mining |
|---|---|---:|
| Texture pixels | section 4, CMPR blocks (two RGB565 words then four index bytes), 32-aligned | 6.7 MB |
| Image headers | `igImage2` records in section 1 | 224 |
| Texture attribute lists on render nodes | `igTextureAttr2List`, `igTextureBindAttr2` | 2 667 and 46 |
| UV animation | `tfbProceduralUVAnimTrack` and `…Data` | 309 and 194 |
| Particle definitions | `tfbParticleInfo` | 4 500 |
| Lights | `tfbLightInfo`, `DirectionalLightInfo`, `igLightAttr` | a handful |
| Audio | section 8, FSB4 banks | 4.7 MB |

The mesh decoder already parses the texcoord attribute (tag 0x1d, two s16 with fraction 14) in every vertex
layout but emits positions and triangles only; the view draws every mesh with one grey Lambert material under a
hemisphere light and a directional key. Textures therefore need four pieces: the `igImage2` header layout (width,
height, format, section-4 offset: not yet read), a CMPR decoder or a re-tiling to standard DXT1 so the browser's
S3TC extension can consume it without decompression, the UV emission, and the node → attribute list → image
binding. Particle effects are 4 500 definitions with no static appearance; a marker at the emitter is all a
static view can honestly show. Lighting is one directional light per level plus ambient: cheap to read once the
records are mapped, and it changes the look more than textures do on a grey level.

## What is not established

The game has never been booted with an edited non-tutorial level. The finding `level.transform.other-levels` is
LIKELY on the layout evidence and says so. Reaching a level other than the tutorial has no input macro: the proof
goes through normal play, with the user at the controls, and the observation recorded afterwards.
