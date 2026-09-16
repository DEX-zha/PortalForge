# Moving scripted objects: barrels and assets

Moving `Barrel(6)` works in the tutorial with its script and its shared model left in place.
Two launches of the same patch show the barrel on the starting island, in front of the windmill.
The control that moves only the asset named `Barrel` to the same spot does not produce that result.
That last control is a single run: it explains one case of a selection with no visible effect, not every barrel.

## Use in the editor

The inspector shows **In-game movement** above the coordinates:

- For an asset or an object that starts out disabled, **Show the placement** selects a counterpart in the level.
  `Barrel` points to `Barrel(6)` among others, and to the other active placements of the same name.
- For an asset created by a script, **Show the possible creator** selects an object whose clone instruction
  explicitly uses its own position. Creations are reported as conditional.
  The studied bridge, dock and cannon cases are filtered by their initial assembly:
  `Template_Bridge_whole` leads to `First_Bridge`, not to the dock that nevertheless shares its script.
- For `Drifting_Piece`, moving still translates the private trajectory points along with the anchor.
  An unrecognised or shared trajectory is still refused.
- For the other placements, the inspector describes an initial position whose visual effect remains to be checked.

The links select and frame the object; they modify no data. Their coordinates follow the session.
The shared model and the placement's own position are explained separately. The presence of `displace` or
`slide` is no longer enough to suggest a reset: those instructions may move copies or debris.

## Controls in Dolphin, 15 September 2026

Source: `level/Level_027_Tutorial.bld`, entry 3, decoded file SHA256
`2976f3597df5f7aa8f3ba564b6f54c6170a08cabb204753d2bf3c70206a32e3f`.

| Variant | Modification | Observation |
| --- | --- | --- |
| `barrel-control-1789474472958` | `Barrel(6)`, offset 3074164: xyz → `(88, 11.5, 40)` | Barrel lying on its side, visible between the windmill and the bridge; tutorial playable. |
| `barrel-control-1789475022808` | Exactly the same rebuilt archive | Same barrel at the destination; tutorial playable. |
| `barrel-resource-1789475419544` | `Barrel`, offset 3983352: same xyz; `Barrel(6)` unchanged | No barrel at the destination in the playable captures. Single comparison, run after the positive attempts. |

Each variant changes three f32be words only: `+0x24`, `+0x28`, `+0x2C`.
The model `barrel.mdl` (2794492), shared by 25 placements, and `Barrel.ai` (2739632) stay unchanged.
Positive archive SHA256: `ee1b35459597567c976abfd52b488e6866a7f36fe41dfe97aba93b57c4b2a41b`.
Asset archive SHA256: `005f2086c9498c343d63c722d81cc9e51b36f6851be27515bb5bad9182141653`.

All three runs have a FileMon line at **15 333 kB**, against **15 241 kB** for the original. That control proves
the replacement was consumed; the visual result is judged separately on the captures at the end of the macro.
In both positive runs the triple appears at `0x804F81E0`, `0x80CE4930` and `0x81235C90` among others,
on top of the copies of the loaded placement at `0x810AA8B8` and `0x810AA8D0`.
In the asset control it appears only at `0x8118883C` and `0x81188854`, inside the loaded asset block.
These triple searches complement the images; they are not an exhaustive inventory of the actors.

All three research Dolphins completed the 53-step macro with Sonic Boom, then closed normally.
The personal installation and the original WBFS were preserved. Captures, memory, archives and traces stay in
`.local/script-remediation/<identifier>/` and `.local/dolphin-evidence/`. The normalised result, validated against the
experiment contract, is `.local/dolphin-evidence/experiments/barrel-placement-2026-09-15.json`.

## Conclusions and limits

**CONFIRMED**: translating the `Barrel(6)` placement to this destination works without modifying any script,
pointer or shared value. Sharing the model therefore does not prevent this translation.

**LIKELY**: the suffix-less `Barrel` is an asset, or an object that starts out inactive; moving its storage
position does not move the visible barrels. Its initial bit `+0x54 & 1`, its references and the single control
all agree. The counterparts offered are distinct candidates, not necessarily copies made from that asset.

`Barrel.ai` contains movements aimed at `Barrel_Spinner` and at the destruction particles.
`LootSystem_Init.ai` references the destructible sets through its loot macros. That does not demonstrate
a general reset of positions. The macro graph is not executed by the editor.

Other scripts may impose a trajectory, create an actor from a variable, or depend on a location.
This remediation makes choosing the anchor easier; it does not simulate every script. No new script field,
activation flag, collision or behaviour is editable. The barrel lies on its side in game, but its direct preview
still uses the heading alone: pitch and roll are not supported by that rendering. M4/M5 are unchanged.

## Reproduction and validation

In a separate session opened on the original source, select `Barrel(6)` (3074164), enter
`(88, 11.5, 40)`, then use **Patch** with **Tutorial test, then close Dolphin**. Launch the same patch again.
Compare with another original session where only `Barrel` (3983352) receives those coordinates.
Do not add these controls to the user's working modifications.

`editor-movement-diagnostics.test.mjs` checks the bounded expressions, the links, the bridge/dock distinction,
that the shared model does not change, and undo/redo byte by byte. These tests failed before
the implementation. The WebGL check with a separate Edge profile verifies navigation, moving the right barrel,
undo/redo, framing and the bridge/cannon poses, with no browser error.
The local suites pass: 237 SSA tests and 6 Dolphin MCP tests, with no failure and no skipped test.

Session `s_d58eb87d` was rebuilt from the plans of its 30 history states, with byte equality
checked at each state. Saved file kept: SHA256
`33acc5d35eccc586161b6127ebe14f4979fb8029213f45ebce34263fd6fa06df`; 20 modified words in total.
The user's existing patch and the local checkpoint are preserved, separately from the barrel runs.
