# Validation: what was booted, and what it does and does not prove

Every run below went through the editor's own builder and launcher (`research-probes/native-level-probe.mjs`):
the level reached through the archive redirect and the tutorial checkpoint, patch consumption proven by the file
monitor, every addition read back from memory at each capture of the level and at the end, clean stop and research
profile restored. Mining unless a section says otherwise. Records: `.local/dolphin-evidence/editor-runs/<run>.json`;
batch results: `.local/addition-campaigns/<level>/`.

## A1 — the recipe on another level (2026-09-17)

Eight additions with the proven 144-byte slot, Mining's base `0x80DC6F48` and anchor `MineTrain` from its scene
snapshot, every source created from the activation manager hook.

| Source | Kind | Boot 1 | Boot 2 |
|---|---|---|---|
| `Lantern_01` | active, scripted | created | created |
| `gem_emerald(2)` | active, scripted | created | created |
| `MiningWall_1(3)` | active, scripted | created | created |
| `amethyst` | active, scripted | created | created |
| `Rock_Breakable_Half` | stored template, scripted | created | created |
| `Food_Pizza` | stored template, scripted | created | created |
| `Helmet` | stored template, no script | created | created |
| `Key Pickup` | stored template, scripted | created | created |

Runs `editor-direct-test-1789671375662-ad57b21e` and `editor-direct-test-1789671550982-a346f9ba`, the same
compiled recipe on both (sha256 `0500bdff1e…`). Each instance: class `0x80481674`, state 1, its own actor, its
source as parent, the source's model and script, the requested position and heading, at all four readings of each
run. Finding `level.prop.native-addition-other-levels`, LIKELY.

**Not proven**: rendering. The captures of a direct test show the visiting-Skylander prompt and the opening
dialogue, whose camera does not frame the batch; looking at the additions takes a direct-play launch. Behaviour,
collection and combat are not judged either, and no other level was booted.

## A2 — thirty-two additions from the compact table (2026-09-17)

Thirty-two sources of thirty-two families, the nearest to the start with a visible model, 40-byte rows and one
shared argument block (2 144 bytes of recipe).

| Reading | Boot 1 | Boot 2 |
|---|---|---|
| first capture of the level | 32 of 32 | 32 of 32 |
| second capture | 22 of 32 | 22 of 32 |
| third capture | 22 of 32 | 22 of 32 |
| end of the run | 22 of 32 | 22 of 32 |

Runs `editor-direct-test-1789671746399-84848d08` and `editor-direct-test-1789672039351-5580ad6e`, the same compiled
recipe (sha256 `8d64c26096…`) and the same verdict for each source on both boots. Every row got its own heading
(0, 45, 270, 180, 251, 19 degrees in one batch), which is what the shared argument block had to prove. The ten that
are gone after the first reading are the same on both boots: `Automaton_Head`, `Automaton_Hand`,
`Automaton_Foot`, `Automaton_Shingle`, `Edgar_Closing Cutscene`, `Foreman_closing Cutscene`, `Camera_Dummy`,
`Hay_Debris1(1)`, `Hay_Debris2(1)`, `Formation_Node_TS`: debris, dead parts, actors of the closing cutscene and
helpers that their own scripts remove or hide. They are filed as created then removed, not as failures. Finding
`level.prop.native-addition-table-layout`, LIKELY.

The first reading happens while the visiting-Skylander prompt is still on screen: the level is loaded and the
additions exist before the player sees it.

**Not proven**: rendering, more than 32 at once, the ceiling of the game's own actor pools.

## E1 — enemy set-ups, the first objects with nothing to draw (2026-09-17)

Mining places its enemies through model-less records (`Intro_Elemental_Swarmer(1)`, `Intro_Elemental_Near(6)`,
`Intro_Elemental_Heavy(1)`, `Intro_Enemy_Thief(1)`), the kind the editor used to block. Four of them were added
next to the start. Runs `editor-direct-test-1789672248949-fb386024` and `editor-direct-test-1789672443373-aa1e1799`:
4 of 4 created at the first reading on both boots, which proves the zero model word passes the recipe's guard; all
four gone at the next reading, their instances' memory reused. The second boot scanned the placement instances the
game had created around the batch: nothing stood at the set-ups' positions. A set-up's script decides where and when
it clones its enemy, and a copy placed elsewhere leaves nothing. **Adding a set-up is not how to add an enemy.**

## E2 — enemies from their stored templates (2026-09-17)

The enemies themselves are stored templates with a model and an enemy script. Six were added on a 3 by 2 grid from
(76, 10.8, -47): `Elemental_Swarmer`, `Elemental_Near_1`, `Enemy_ElementalHeavy`, `Enemy_ElementalHeavy_Ranged`,
`Enemy_Elemental_Mage_Fire` and the placed `Enemy_Thief(1)`.

| Enemy | Asked at | Boot 1, end of run | Boot 2, end of run |
|---|---|---|---|
| `Elemental_Swarmer` | 76.0, 10.8, -47.0 | 92.1, 12.3, -47.3 | 90.9, 12.0, -46.1 |
| `Elemental_Near_1` | 79.0, 10.8, -47.0 | 83.6, 10.8, -49.3 | 83.5, 10.8, -49.2 |
| `Enemy_ElementalHeavy` | 82.0, 10.8, -47.0 | 81.7, 11.0, -48.4 | 81.6, 11.1, -48.2 |
| `Enemy_ElementalHeavy_Ranged` | 76.0, 10.8, -44.0 | 76.2, 10.7, -45.3 | 76.2, 10.7, -45.3 |
| `Enemy_Elemental_Mage_Fire` | 79.0, 10.8, -44.0 | 79.1, 10.8, -44.0 | 79.1, 10.8, -44.0 |
| `Enemy_Thief(1)` | 82.0, 10.8, -44.0 | 82.0, 10.8, -44.0 | 82.0, 10.8, -44.0 |

Runs `editor-direct-test-1789672643910-5a1b0119` and `editor-direct-test-1789672812252-5e9db3c3`, the same compiled
recipe (sha256 `d0279c21c9…`): 6 of 6 verified at all four readings of both boots, created where asked (the initial
transform is checked apart from the current one) and then moving under their own behaviour. **This is the first
visible result of the feature**: the last capture of both runs shows fire at the right of the frame and the
Skylander pushed into view during the opening dialogue, where the same capture of the A1 runs shows neither
(`shot diff`: the largest cluster is 120 by 143 pixels at the bottom right). Finding
`level.prop.native-addition-enemy-templates`, LIKELY.

**Not proven**: combat, damage, loot and defeat; what an added enemy does outside its activation range; enemies
whose template is not in the level (phase C).

## L1 — a level never measured: the table written into the running game (2026-09-17)

Undead Volcano had no scene snapshot and had never been booted by this project. Its patch carried the live
routine: 3 256 bytes, the same for every level, with an empty table of 59 rows. The launch reached the level
through the archive redirect, measured it at the first capture of the level (base `0x80DBA5A0`, anchor
`Life_Vine_01`, first attempt), laid eight sources out beside that anchor and wrote them into the game.

| Source | Boot 1 | Boot 2 |
|---|---|---|
| `Life_Vine_01`, `TeleporterStart(11)`, `Block_Template`, `RiseBlock_model`, `Elemental_sunBeams`, `Reflect_Start(3)` | alive at all four readings | alive at all four readings |
| `HatBox_Pickup(1)`, `Pottery_D(13)` | created, gone at the first reading | created, gone at the first reading |

Runs `editor-direct-test-1789674098348-7b8a8ff7` and `editor-direct-test-1789674397828-eb0134fc`: the same routine
(sha256 `971662e6a2…`), the same measure, the same batch and the same verdict per source. For the two that are gone
the factory had returned an instance (the row reads "created" with a valid pointer) whose memory was already reused
at the first reading: their own scripts removed them. They are filed as created then removed; the first boots
labelled them failed, which the verdict no longer does. The measure was kept as the level's scene snapshot, so the
level's next patch compiles its table in. Finding `level.prop.native-addition-live-table`, LIKELY. These two boots
are also the first to land in Undead Volcano through the archive redirect.

One boot on a third family, `Challenge_Level_005` (run `editor-direct-test-1789674572271-d7e99109`): the redirect
landed in the challenge (its three-minute timer on screen), the level was measured at the first attempt (base
`0x80DCB064`, anchor `Elemental_Swarmer(6)`, an enemy, because nothing still and script-less was active), eight
rows were written and the factory returned eight instances; three were alive at the end, five were gone at the
first reading. One boot proves nothing by the project's rule; it says the path holds on a challenge level.

**Not proven**: rendering; classic play, where the level is reached by hand and the measure is triggered by the
archive being read; hub and PvP levels; refilling the table while the game runs.

## R1 — more than the table holds: 152 additions, the whole level in one boot (2026-09-17)

Every family of Mining with a visible model, one source each: 152 additions on a grid of twelve columns from
(75, 10.8, -46), through the live routine. The launch measured the level (first attempt), wrote 59 rows, waited for
the routine to attempt them, read and kept what it had written, wrote the next 59 over them, then the last 34.

| | Boot 1 | Boot 2 |
|---|---|---|
| batches written | 3 (59, 59, 34) | 3 (59, 59, 34) |
| rows for which the factory returned an instance | 152 of 152 | 152 of 152 |
| alive at the four readings | 115, 109, 109, 108 | 115, 108, 107, 107 |
| created then removed | 44 | 45 |

Runs `editor-direct-test-1789675453809-e2bce8db` and `editor-direct-test-1789675647260-f7aa929c`, the same routine
(sha256 `971662e6a2…`) and the same batch. The additions of the first two batches were read from the kept rows at
every reading, those of the last batch from the table. The game went through its opening dialogue with 152 more
objects around the start, stopped cleanly, and the profile was restored. Creation is identical on both boots;
survival differs by one source (`Wagon(2)`, destroyed in the second boot only): the batch puts every enemy of the
level next to every breakable, and what follows is a fight, which is not reproducible to the object. The others
that are gone are the same on both boots: debris, projectiles, rock bits, food, dead automaton parts, cutscene
actors, the enemies that died. Every source 30 units from the start was created active with an actor, like those
beside it: within this range an addition is not left dormant.

This is also a level campaign: after these boots 156 families of Mining carry a report (107 verified in game, 49
created then removed), where six boots of 59 would have been needed with a compiled table and 300 with the
one-source rule.

**Not proven**: rendering; the ceiling of the game's actor pools (152 did not reach it); objects with nothing to
draw, left out because a level's singletons are among them (a savestate between batches is the way to take them).

## Census — do additions push the level's own objects out? (2026-09-17)

The user's worry: many additions might make the game drop other objects. The probe read the level's own
placements at every reading of two boots of Mining, one with a single addition, one with the 152 of R1.

| Reading | One addition | 152 additions |
|---|---|---|
| before the additions were written | 53 active | 53 active |
| second capture | 60 active, 313 dormant, 8 other | 59 active, 314 dormant, 8 other |
| third capture | 60, 313, 8 | 61, 312, 8 |
| end of the run | 60, 313, 8 | 62, 311, 8 |

Runs `editor-direct-test-1789677445633-f7b43e43` and `editor-direct-test-1789677598054-72c01d2c`. The level's own
records are 381 in both at every reading. Every object active at the end of the control boot is active at the end
of the other; `Barrel(11)` and `Fan_Hint` are active only with 152 additions, woken because the fight moved the
Skylander into their range. No original object lost its actor. One boot each: the pair has to be repeated before
it is more than a measurement (task T007).

## M1 — memory reserved from the game through the OS arena (2026-09-17)

For a table of additions that does not live in the Gecko area, memory has to be taken from the game without
guessing that it is free. The game's OS reads the end of usable MEM2 from the word at `0x80003128` when it starts
(`0x935E0000` here), and Dolphin applies Riivolution memory patches after the executable is loaded and before its
first instruction (`Boot.cpp`). One patch lowered the word to `0x935A0000`; a second filled the 256 KB above it
with a pattern (a tag and the index of each word) from a value file.

| Boot | Word at `0x80003128` in the running game | The 256 KB block, at the four readings |
|---|---|---|
| reservation, `editor-direct-test-1789678712449-aaa9d8b7` | `0x935A0000` | intact, word for word |
| reservation, `editor-direct-test-1789679147543-71adac31` | `0x935A0000` | intact, word for word |
| control, no lowering, `editor-direct-test-1789678882121-ed05e74a` | `0x935E0000` | all 65 536 words overwritten at the first reading |

The level played as usual on the three boots (patch consumption proven, macro completed). The control is what
makes the result mean something: that block is memory the game uses, and the lowered word is what keeps the game
out of it. A checkpoint restores all of memory, so what a patch writes into memory became part of the
checkpoint's identity (`level-entry.mjs`); the reservation was made with its checkpoint and survived the restore.
A first boot played correctly but read nothing, because the bridge reads at most 64 KB per call; the probe now
reads in chunks. Finding `runtime.memory.mem2-arena-reservation`, LIKELY.

**Not proven**: a table of additions living there and read by the routine (S09); other levels; larger blocks;
memory pressure late in a long level; real hardware, where this word and this region belong to IOS.

## What these boots change

- Success criteria SC-001 (additions on a second level) and SC-002 (at least 32 in one patch) are met as far as
  memory can tell; both wait for a look at the screen.
- The experimental addition of constitution 1.2.0 rests on A1: the recipe creates placed objects and stored
  templates alike on a level it had never run on.
- The editor's switch to the table layout past 18 additions rests on A2.
- Additions no longer need a level to have been measured (L1): the first launch from the editor measures it.
- A scene is no longer bounded by the Gecko area (R1): 152 additions went in through three tables of 59.
- 152 additions cost the level none of its own objects (census, one boot each).
- Memory can be taken from the game honestly (M1): the way is open for a table of thousands of rows that works
  when the game is played without the editor.
- To add an enemy, add its template (E2), not the set-up record that places it (E1). Mining's cards carry 44
  family reports after these ten boots: 30 verified in game, 14 created then removed by their own script.
