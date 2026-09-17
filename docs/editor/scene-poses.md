# Poses of the tutorial's bridges, cannons and model objects

The 15 September 2026 rendering fixes the initial instances of two bridges and three
cannons. Scripts remain responsible for their animations and later changes.
This work concerns the preview only: no level byte is modified and no extra property
is made editable.

## Comparison with Dolphin

The research profile's macro reaches the playable tutorial in
`scene-pose-1789424358122`. The replacement is the one already validated for moving
`Drifting_Piece_ID1`. The MEM1/MEM2 reads, captures and FileMon lines stay under
`.local/mesh-coverage-study/scene-pose/` and `.local/dolphin-evidence/`.
The owned Dolphin process was closed normally after the reads.

The object relocation base is `0x80DBC020`. Created objects carry pointers to their
placement model and to their creator: that is what separates their matrices from
those of the controllers and of the assets stored in the archive.

| Creator | Asset | Initial position | Model Y rotation |
| --- | --- | --- | --- |
| `Dock`, 1776460 | `Template_Dock_whole`, 1783120 | 65.227203, 14.862352, 14.630400 | 314° = 44° − 90° |
| `First_Bridge`, 1875316 | `Template_Bridge_whole`, 1777576 | −6.096000, 5.473598, −19.964399 | 316° = 46° − 90° |
| `Push_Block_Template(1)`, 2302624 | `Push_Canon_Art_Top`, 2155316 | 11.715400, 2.629722, 40.915741 | 156° |
| Same controller | `Push_Canon_Art_Bottom`, 2169700 | Same position | 0° |

In MEM1 the actors are identified around `0x81238E58`, `0x8122A05C`,
`0x8123440C` and `0x81234DDC`. Relative to those positions: `+0x38` references the
asset and `+0x3C` the creator. The model matrices have their translation at
`0x81239120`, `0x81229A60`, `0x81234B30` and `0x81235110` respectively.
The bridge controller matrices keep +44°/+46°: inverting every rotation in the editor
would therefore have been wrong.

`scripted-previews.mjs` applies the quarter turn to the `Bridge_Spawner.ai` bridges only.
For the ID 10 controllers of `PushBlock_Template.ai`, the top and the base are assembled
at the controller's position. The first cannon's pose is measured; applying the same
assembly to the other two controllers is an inference from the shared script, not an
observation of those spots. The previews stay **LIKELY** and read-only.
Their surface selects the editable controller; moving and undo/redo preserve the relative
rotation. The scale comes from the cloned asset.

## Treasure and platform

`Legendary_Treasure_Ancient_Shell`, 4124024, lives in the asset
`Loot_Special_Ancient_Shell.lvl`, at (33.007, 4.911, −41.955). Bit 0 of the word `+0x54`
is set, as it is for the bridge and cannon models. No terrain surface is found under that
point: adding an artificial platform there would be misleading.

The level object is `Legendary_Treasure_Ancient_Shell(1)`, 1823456,
at (−70.448, 5.004, 0.667), bit 0 clear, group `Loot`.
Geometry unit **737**, material `WoodPlank_01_MAT`, holds the platform:
the vertical intersection with its triangles gives **Y = 4.968**, just under the treasure.
It already appears among the displayed scenery units; no mesh was invented.
The reproducible diagnostic is `.local/mesh-coverage-study/terrain-pose.mjs`.

The reading of bit `+0x54` stays **LIKELY** and is not editable. Since 17 September 2026 it
applies to every level with the class detected for the file, not only to the tutorial: on
Mining it marks 236 records (the breakable-rock halves, the track-switch and mine-train
templates, the game-element libraries) against 296 on the tutorial, the word being exactly
4 or 5 on every record of both levels (see the
[feature 006 research](../../specs/006-multi-level-editing/research.md)). The
**Disabled models and objects** layer displays those records at their storage coordinates.
They are hidden by default; some may be activated later by the game. The inspector offers a
link to the active object of the same name when its model and behaviour agree, the treasure
in particular. The bridge and cannon previews above remain tutorial-only.

## Checks

`editor-scene-poses.test.mjs` compares the previews with the measured poses, checks that
the level bytes stay unchanged, and covers the relative rotations after a refresh.
The local WebGL captures are under
`.local/mesh-coverage-study/browser-tutorial-bld/pose-*.png`.
