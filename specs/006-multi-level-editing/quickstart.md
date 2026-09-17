# Use and validation

From `tools/ssa-archive`:

```powershell
node cli.mjs edit levels                          # the 76 levels, their state and what the machine holds for them
node cli.mjs edit open Level_000_Mining --open    # extract and decode if needed, serve, open the browser
node cli.mjs edit open level/Challenge_Level_005.bld --port 7380
```

`edit open` accepts a disc path, a level name with or without `.bld`, or a workspace name. A level whose original
was never extracted needs `game` in `.local/dolphin-config.json` (or `--game`); the extraction lands under
`.local/samples`, the decoded workspace under `.local/workspaces/<name>-all`. `edit serve <file>` still opens a
specific decoded file; that server has no picker.

In the editor:

1. The **Level** tab next to **Project** is the full view: on the left the current level with its archive, entry,
   runtime map, voice pack and the capabilities with their reasons; on the right one card per level of the disc,
   with a search, a family filter, chips that say how far the evidence goes (green CONFIRMED, amber LIKELY, purple
   experimental, grey not available) and **Open**. The header keeps a quick picker with the same levels.
   **Open** switches; with unsaved edits a dialog asks before discarding them.
2. **Inspector → Level information** lists the capabilities of the level: Move / rotate / scale, Duplicate, Add,
   Automatic test, Direct entry, each CONFIRMED, LIKELY or not available, with the finding and the reason on hover.
   Outside the tutorial, transforms are LIKELY and the sentence under the rows says why.
3. The tally shows `parked far away` when the level keeps objects at absurd coordinates (boss cameras at
   30480, 30480, 30480, switch templates at z ≈ -815). They are drawn and selectable; they do not size the view.
4. Move, rotate, scale, Save and Patch work as on the tutorial. Launch offers **Normal play** only: navigate to the
   level yourself, look, then record what you saw.

## Landing in the chosen level

Open the level by name with the game image configured: its voice pack `level/<name>.arc` is extracted once. After
**Save → Patch**, the launch mode defaults to **Direct level play via the tutorial slot**. The patch carries a
second descriptor in which the level's `.bld` and `.arc` are served under the tutorial's file names, so the
confirmed tutorial checkpoint (slot screen, press A) makes the game load them. The first launch on a level
prepares a checkpoint for that layout (about 2 minutes); later launches restore it and reach the level in about
two minutes. The macro presses A, waits for `level/Level_027_Tutorial.bld` to be read at the level's size, taps A
through the "Skylander visiting from another adventure" prompt and takes four captures. **Direct level test**
closes Dolphin afterwards; **Direct level play** leaves you at the controls.

Confirmed on Mining by two identical boots on 2026-09-17 (`level.entry.archive-redirect`): the mine and Blobbers'
opening dialogue appear where the tutorial's opening would. The other families are LIKELY, labelled so in the
launch mode and the chips, until two boots land in one of their levels; edit `docs/level-entry-status.json` with
the run ids to promote a level. Nothing about the tutorial's own direct entry changes. A level opened with
`edit serve` on a file has no voice pack and no redirect; Normal play stays available everywhere.

`node research-probes/redirect-boot.mjs --level <name> [--prop <name>[,<name>]] [--raise <units>]` runs one boot
through the editor's own path (open, edit, save, patch, launch) and prints the run record; run it twice for the
two-boot rule.

## The view as the game has it

The editor draws the file: every object that can exist. The game, at a moment of play, holds only part of it
(objects activate by distance and trigger) and creates more by script. To see the game's view, launch the level
from the editor (Direct level play), wait until the game is playing, then press **Capture the scene from Dolphin**
in the Layers pane. The editor reads every placement record in MEM1 and the live actors, keeps the snapshot under
`.local/dolphin-evidence/scene-snapshots/<level>/`, and the **As in game · snapshot** layer draws it: active
objects solid, dormant ones dimmed, templates and finished initialisers hidden, moved objects at their in-game
position, and the actors a script created drawn in blue with the model of the record they were cloned from. The
inspector adds an "in game" row per object. A snapshot is evidence about one moment of one run (LIKELY), never a
property of the file: nothing about it is saved or patched. `research-probes/actor-probe.mjs` takes the same
snapshot from the command line, one boot.

## Proving an edit on another level

1. Open the level, move a static prop (no behaviour script) by a distance a screenshot cannot miss; write the
   prediction in the Playtest settings.
2. Save, Patch, Launch: through the redirect when it works, otherwise in Normal play, reaching the level
   yourself; take a screenshot at the spot.
3. Stop, then do it again from a cold boot with the same patch. Two identical observations, with the FileMon size
   line proving the rebuilt archive was read, promote `level.transform.other-levels` to CONFIRMED through
   `findings promote`; two boots landing in the chosen level promote `level.entry.archive-redirect` to LIKELY.

## Runtime maps for other levels (roadmap step 2)

Duplication needs a map of the words the game rewrites at load. Capture it with the level resident in Dolphin:
`experiment ptr-scan` from a save state taken inside the level, then `igz fixups <decoded level> <dump>
--out .local/dolphin-evidence/runtime-maps/<lowercase name>.json`. The editor picks the file up by name; a
`runtime_maps` object in `.local/dolphin-config.json` overrides it.

## Checks

```powershell
cd tools/ssa-archive ; npm test                   # 319 tests, the six new files included
node tests/browser-multilevel.mjs                 # real Edge: picker, discard dialog, three switches, zero exceptions
node cli.mjs edit preview ..\..\.local\workspaces\level_032_haunted_castle-all\entries\3-level.bld.decoded --archive level/Level_032_Haunted_Castle.bld --entry 3 --meshes --out ..\..\.local\level-check\haunted.png
```

The browser scenario needs the local level data and Edge; it starts no Dolphin. Its captures and `result.json`
land under `.local/level-check/browser-<time>/`.
