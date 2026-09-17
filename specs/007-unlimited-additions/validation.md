# Validation: what was booted, and what it does and does not prove

Every run below went through the editor's own builder and launcher (`research-probes/native-level-probe.mjs`):
Mining reached through the archive redirect and the tutorial checkpoint, patch consumption proven by the file
monitor, every addition read back from memory at each capture of the level and at the end, clean stop and research
profile restored. Records: `.local/dolphin-evidence/editor-runs/<run>.json`; batch results:
`.local/addition-campaigns/level_000_mining/`.

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

## What these boots change

- Success criteria SC-001 (additions on a second level) and SC-002 (at least 32 in one patch) are met as far as
  memory can tell; both wait for a look at the screen.
- The experimental addition of constitution 1.2.0 rests on A1: the recipe creates placed objects and stored
  templates alike on a level it had never run on.
- The editor's switch to the table layout past 18 additions rests on A2.
- To add an enemy, add its template (E2), not the set-up record that places it (E1). Mining's cards carry 44
  family reports after these ten boots: 30 verified in game, 14 created then removed by their own script.
