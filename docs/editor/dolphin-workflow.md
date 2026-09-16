# Patch, launch and scripted movement

Updated 15 September 2026.

In the editor, **Patch** saves the current modifications, rebuilds the original archive around the
modified IGZ entry, then decodes that entry again to check it is exactly equal to the save. The launch
uses that same patch. A later modification, or an altered replacement, forces a new rebuild.
The old Patch button wrongly copied the decoded entry in place of the whole archive; the old launch
rebuilt a separate patch of its own. Both paths are replaced by a single chain.

The option "Launch automatically after patching" is enabled by default. Two modes are offered:

- **Tutorial test, then close Dolphin**: load the configured figure, skip the menus, reach the
  tutorial and move the Skylander right then left. Captures and a local report, then the owned Dolphin
  is closed. The macro exists for `Level_027_Tutorial` only; it usually takes about five minutes.
- **Plain game**: open the patch, load the figure, leave the menus and the controls to the player.
  The **Stop** button closes the owned Dolphin; closing Dolphin by hand also ends the session.

The figure comes from `--figure`, from `.local/dolphin-config.json` (`figure`), or from the source validated
in the M0 proof. The MCP only exposes a copy of the figure to the game. The WBFS and the user's own Dolphin
are left untouched. Reports are under `.local/dolphin-evidence/editor-runs/`, captures under `.local/dolphin-evidence/`.
A `spawn EPERM` or `spawn EACCES` failure before the MCP/Dolphin starts means process creation is being
refused. The editor server itself must be started from a Windows terminal that is allowed to create
processes: a server started in a restricted environment passes its restrictions on to every later launch.
Restarting the browser alone does not change those permissions. Keep the session and its history before
restarting the server; a patch that is already saved does not need to be rebuilt. Reports now name the
failing stage, the system code and the original error. There is no automatic workaround for permissions.
A macro that ran to the end and a proven file consumption are not an automatic validation of the visual
effect. The new modes are previews, not promotions of the M4/M5 gates.

## Moving an island that kept returning to its position

`Drifting_Piece_ID1` does not only follow its placement point: `Drifting_Piece.ai` animates it along a
private three-point trajectory. The anchor-only control did load the new coordinates into RAM, but the user
did not see the expected movement. Translating the three points together with the anchor made the movement
visible, confirmed by the user and then reproduced on a second boot of the same patch.

The editor now translates those points along with the position. Undo/redo and the save plan cover every
modified word. This capability stays limited to the tutorial's confirmed layout, with known runtime pointers
and a private trajectory. Rotation, other scripts and collisions are not inferred from this result.
See the finding `level.drifting-piece.waypoint-translation`.

## Bridges and cannons

The bridge at the start is spawned by `Bridge_Spawner.ai` (placement `Dock`, asset `Template_Dock_whole`); the
placement named `First_Bridge` uses the same script with `Template_Bridge_whole`. The assets were already
decoded but appeared at their model coordinates. The **Bridges and cannons · preview** layer assembles the
assets at the spawner's point. Reading the matrices in Dolphin fixes the bridges' 90° offset.
The previews stay LIKELY and read-only, with no destruction and no animation.

The inspector lists the assets referenced by the `clone` instructions and marks the objects used as
models. The cannon top `Push_Canon_Art_Top` is itself a model used by `PushBlock_Template.ai`, and its
script creates further elements. The top and the base are assembled at the tutorial's three ID 10 controllers;
the pose of the first one is compared with the actors in Dolphin. Later states are not simulated.
A marker with no direct model is no longer presented as necessarily invisible.

Assets and objects that start out disabled are gathered in a layer that is off by default. For the
Ancient Shell treasure, the model inspector points to the `(1)` object actually placed on the dock.
See [the poses and their evidence](scene-poses.md).

Local validation: SSA tests, MCP tests, a WebGL check in an isolated Edge, the launch buttons with a
simulated runner; real runs of the automatic test, of the plain mode and of its stop, then two runs of the
trajectory.

## Verification of the `spawn EPERM` fix, 15 September 2026

The editor server had been started in the restricted environment and refused to create the MCP process
before any Dolphin launch. After restarting the server from an allowed terminal, the test was launched through
`/api/launch` on the user's existing patch `edit-3-level.bld-1789489608180`, without rebuilding or modifying
its data. The 29 history states were restored with a byte check; the save SHA256
`704c62f0fd429cba60a810282ffc2d584ba78958dc3c407671fc3d3d269383a9` was preserved.

Result `editor-test-1789489881698-57dc88f4`: `MACRO_COMPLETED`, 17 captures, Sonic Boom in the tutorial,
FileMon **15 333 kB** confirming the replacement was consumed, then a normal close of Dolphin PID 18192
(`forced: false`). The editor is unlocked, with the same save, the same patch and the same 29 operations.
Local report: `.local/dolphin-evidence/editor-runs/editor-test-1789489881698-57dc88f4.json`; session comparison:
`.local/script-remediation/editor-eperm-verification.json`. Tests: **238 SSA + 6 MCP**, all passing.
This check validates the launch and the macro; it does not automatically judge each visual modification in the patch.
After this check, the user confirms that everything works and that their modifications are present in game.
