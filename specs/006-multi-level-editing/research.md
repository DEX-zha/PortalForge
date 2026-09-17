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

## What is not established

The game has never been booted with an edited non-tutorial level. The finding `level.transform.other-levels` is
LIKELY on the layout evidence and says so. Reaching a level other than the tutorial has no input macro: the proof
goes through normal play, with the user at the controls, and the observation recorded afterwards.
