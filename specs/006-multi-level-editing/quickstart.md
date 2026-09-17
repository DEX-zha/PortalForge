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

1. The header shows the current level and a picker grouped by Story, Hub, Challenge, PvP and Other, each entry
   with its placement count, `· map` when a runtime map exists, `· decode on open` when the workspace is missing.
   **Open** switches; with unsaved edits a dialog asks before discarding them.
2. **Inspector → Level information** lists the capabilities of the level: Move / rotate / scale, Duplicate, Add,
   Automatic test, Direct entry, each CONFIRMED, LIKELY or not available, with the finding and the reason on hover.
   Outside the tutorial, transforms are LIKELY and the sentence under the rows says why.
3. The tally shows `parked far away` when the level keeps objects at absurd coordinates (boss cameras at
   30480, 30480, 30480, switch templates at z ≈ -815). They are drawn and selectable; they do not size the view.
4. Move, rotate, scale, Save and Patch work as on the tutorial. Launch offers **Normal play** only: navigate to the
   level yourself, look, then record what you saw.

## Proving an edit on another level

1. Open the level, move a static prop (no behaviour script) by a distance a screenshot cannot miss; write the
   prediction in the Playtest settings.
2. Save, Patch, Launch in Normal play; reach the level; take a screenshot at the spot.
3. Stop, then do it again from a cold boot with the same patch. Two identical observations, with the FileMon size
   line proving the rebuilt archive was read, promote `level.transform.other-levels` to CONFIRMED through
   `findings promote`.

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
