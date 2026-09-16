# Use and validation

1. Open the tutorial with its runtime map; refresh the editor after the server has been updated.
2. In Project, pick **Can add**: nine exact validated sources, among them the Nipper and Clamper Chompies, two coins, the Barrel, two sunflowers and a weed. The other entries show their diagnostic, detailed in the inspector. See the list in [compatibility.md](compatibility.md).
3. Press and hold on the thumbnail or the name, move towards the scene and release. The point follows the visible surface, or the horizontal plane when there is no surface. No object has to be chosen for replacement.
4. The new entry `(Copy 1)` can be selected in the hierarchy. Move and Orientation work; Scale stays at 100 %. Eight copies at most, with the counter visible in Project. The ninth drop is refused without changing the scene.
5. Save keeps the level and `<file>.portalforge.json`. Keep both files together. Patch builds the archive and its Gecko companion. The editor's launch button installs the latter automatically for the dedicated Dolphin session.
6. Choose **Direct level test, then close Dolphin** or **Direct level play, keep Dolphin open** for the tutorial. An automatic preparation is needed the first time, after which the menus are skipped; the current patch is re-read at every launch. The plain modes stay available. After a level reload, stop and restart emulation to recreate the additions. See [the direct launch guide](../../docs/editor/direct-entry.md).
7. Undo/Redo act on the distinct copies; Reset scene returns to the opened level and keeps the history recoverable. Reopening a saved file restores its associated additions.

In **Inspector → Playtest settings**, tick **Skip opening cinematic** to skip the tutorial's opening, or leave it unticked to keep it. The choice is remembered in the browser and unticked by default. Available in the three automated tutorial modes; disabled in **Normal play**. It also works with **Launch automatically after patching**, with no patch rebuild needed to change the choice.

The Riivolution descriptor alone is not enough for the additions: go through the editor's launcher. Scope: **SSPP52 Rev1, tutorial, nine exact sources, eight copies in total, position/orientation, scale 100**. The objects keep their scripts and activation distances: they may move or disappear during play. Collection and combat are not declared fully validated. Regenerate old scripted-addition patches with this version of the editor.

To test another source, use **Test selected** or **Test next 2 types**. Two automatic boots, intermediate memory checks, captures and a local report; **Stop test** interrupts the campaign. See [compatibility.md](compatibility.md) for the states, the families and the limits. The other members of a family still have to be validated individually.

Checks: `npm test` in `tools/ssa-archive` and `tools/dolphin-mcp`. From the root, `node tools/ssa-archive/tests/browser-catalog.mjs` checks the real mouse gestures, keyboard folders, hierarchy, rotation, history, save and patch building in an isolated `.local/` directory. This test needs the local tutorial data and Edge; it does not start Dolphin.

Two boots of the patch produced by that scenario were validated: see [validation.md](validation.md). The detailed data, captures and reports stay local.

The `--barrel`, `--chompy`, `--coin`, `--clamper` and `--weed` options of that browser test select the source. `--eight` checks eight real drops, the refusal of the ninth, the history and the save/reopen of the patch.
