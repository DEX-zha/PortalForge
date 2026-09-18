# M0 — Dolphin MCP: mandatory preliminary step

Set up on 12 September 2026. **State: PASS — installed, tested with SSA in a playable scene, Riivolution replacement proven at engine level.** The machine-readable status is in `docs/m0-status.json`; `dolphin_status` returns it.

This step is part of building PortalForge. Detailed planning and development of the SSA tools can now begin. M0 validates neither M1, nor M2, nor the feasibility of an editor.

## Actual installation

| Item | Installation |
| --- | --- |
| Existing Dolphin | Dolphin 2606a, configured by `official_dolphin` in `.local/dolphin-config.json`; kept and never driven |
| MCP runtime | `.local/dolphin-felk/Dolphin.exe`, Felk `scripting-preview4` |
| Server | `tools/dolphin-mcp/server.mjs`, Node.js, MCP stdio, 35 tools |
| Dependencies | `mcp-dolphin` 0.3.0, MCP SDK 1.29.0, Ajv 8.20.0, locked in `package-lock.json` |
| Local bridge | `tools/dolphin-mcp/bridge.py`, loaded automatically with `--script` |
| Native commands | PowerShell UI Automation scripts in `tools/dolphin-mcp/`, targeted at the owned PID |
| Internal network | `127.0.0.1:55355`, local only |
| Research profile | `.local/dolphin-user/` |
| Evidence | `.local/dolphin-evidence/` |
| Codex connection | global `dolphin` server, Node command with the absolute path of the local server |
| Game tested | SSA Europe Rev 1 WBFS supplied on the Desktop; memory identifier `SSPP52`, revision 1 |
| Figure tested | `Sonic Boom.sky` (1024 bytes); the original is never exposed to the game, only a copy is loaded |

Machine-specific paths live in `.local/dolphin-config.json`, never in the code: `game` (the WBFS, used by `dolphin_launch` when no game is given), `figure` (the Skylander dump), `dolphin_tool` (DolphinTool.exe, used to identify and extract the disc) and `official_dolphin` (only for the `official` runtime). Start from `tools/dolphin-mcp/config.example.json`; each key can also be set through an environment variable (`PORTALFORGE_GAME`, `PORTALFORGE_FIGURE`, `PORTALFORGE_DOLPHINTOOL`, `PORTALFORGE_OFFICIAL_DOLPHIN`). A missing setting fails with a message that names the key to add.

The archive downloaded from the Felk releases is `dolphin-scripting-preview4-x64.7z`. Recorded SHA-256: `FC6B298852B54AAED71C7E925919ACED0B56CECA7289BFCC07C06B4F47970DA0`. It is the digest of the artefact that was tested, not a publisher signature.

## Use in Codex

Reload the Codex session so the newly registered server is discovered. The configuration was checked with `codex mcp get dolphin --json`. The runs in this work use a real separate MCP client, not a simulation of the protocol.

1. Call `dolphin_status` to learn the runtimes, the connection and the M0 status.
2. Call `dolphin_launch` to start SSA in the isolated profile (WBFS or Riivolution JSON descriptor).
3. Call `dolphin_ping` once the game has started.
4. Load a figure with `dolphin_load_figure`, then use the observations, controls and saves below.
5. Call `dolphin_stop` to close only the instance owned by this MCP session.

The MCP process stays available when Dolphin is stopped. A `ping` being unavailable in that state is expected. Do not start a second instance on the bridge port. After a server restart, an old Dolphin instance that is still open must be closed before a new launch: process ownership is not recovered automatically. The user's own Dolphin 2606a, if open, is never touched.

## Capabilities and limits

| Function | Tools / behaviour |
| --- | --- |
| Launch and stop | `dolphin_launch`, `dolphin_stop`; a Windows close is requested before a fallback kill, with an explicit `forced` result |
| Connection and status | `dolphin_ping`, `dolphin_get_info`, `dolphin_status` (includes `M0` from `docs/m0-status.json`) |
| Memory reads | `dolphin_read8/16/32/64`, `dolphin_read_range`, `dolphin_read_float` |
| Memory writes | `dolphin_write8/16/32/64`, `dolphin_write_float`; MEM1/MEM2 only, 64-bit values passed exactly as decimal text |
| Wii controls | buttons, IR pointer, acceleration in m/s², angular velocity in rad/s |
| Nunchuk | `dolphin_hold_wii_input`, `dolphin_get_wii_input`; C/Z buttons, sticks between -1 and 1 |
| Held actions | `dolphin_hold_wii_input`, 1 to 600 frames; values refreshed every frame, release observed in game |
| Wiimote | `dolphin_connect_wiimote` reconnects an emulated Wiimote through the native interface without disconnecting an already active Wiimote |
| GameCube | buttons, sticks -1..1, triggers 0..1; not validated on a GameCube game |
| Waiting | `dolphin_frame_advance` waits for **at least** N frames, bounded at 15 s; during loads (under 60 fps) wait in slices of 120 frames |
| Pause / resume | `dolphin_pause`, `dolphin_resume` through the native interface, checked against the toolbar state; the bridge does not answer while paused |
| Portal | `dolphin_load_figure` copies the figure into `.local/figures/` then loads it into slot 1..16; `dolphin_remove_figure` empties a slot without deleting the file |
| Captures | `dolphin_screenshot`, PNG image returned to the client and kept in the evidence |
| Logs | `dolphin_logs`, bounded reads; calls and errors in `calls.jsonl` |
| Save state | `dolphin_save_state`, native slots 1..10 through the Dolphin interface; checks that a new `SSPP52.sNN` file is written, the old one is copied into the evidence |
| Restore | `dolphin_load_state`, slots 1..10; checks the file then schedules the read; resuming the game is to be observed (capture) |
| Riivolution | `dolphin_build_patch_launch` prepares a JSON descriptor from an existing XML; use its path with `dolphin_launch` |
| Reset | `dolphin_reset`, exposed but not yet tested in a playable scene |

Saves through the Python bridge (`savestate.save_to_slot`) fail mid-game; that is why the state tools go through the native interface, which is limited to Dolphin's ten slots. The native tools (pause, states, Portal, Wiimote) require an interactive Windows desktop and a Dolphin interface in French or English.

Bridge requests expire after a bounded delay; an expired write must not be retried automatically: its outcome is unknown.

**Blocking Dolphin alerts.** A Dolphin "PanicAlert" (for example "IOS: unable to read a file required for the SSL services (…/Wii/clientca.pem)", triggered by SSA when saving) pauses emulation until OK is clicked: the bridge goes silent and the scripts fail with a "bridge timeout". The research profile therefore sets `UsePanicHandlers = False` in `[Interface]` of `Dolphin.ini` (written by `initializeProfile`, and added by hand to the existing profile on 12 September 2026); the alerts go to the log. Heavy loads (69 MB of `Title.arc`) can also freeze frames for several seconds: wait in slices and tolerate a few consecutive timeouts before concluding that it is stuck.

### The Riivolution descriptor trap on Windows

Dolphin splits the XML path on `/` only (and on `:` under Windows) to find the reference folder for relative `external` files. A path with backslashes yields the root folder `C:`, and every file replacement silently becomes a non-event: no log, and the game starts with the files from the disc. `buildDescriptor` therefore writes every path with `/`; a unit test checks it. A "successful boot" of a descriptor never proves that a file was replaced.

Second rule, learned during the first M1 attempt: an `external` **without** a leading `/` resolves against the **XML's folder** (or against the `root` attribute of the `<patch>`), while an `external` **with** a leading `/` resolves against the descriptor root (`root` in the JSON). An XML stored in `riivolution/` with files in `files/` must therefore write `external="/files/…"`, otherwise the file is not found and the game serves the original; the file monitor showed it (52 733 kB served instead of 52 735). `tools/ssa-archive` generates the absolute form.

## Evidence obtained

The local files `m0-proof.json`, `live-test.json`, `patch-test.json`, `calls.jsonl`, the PNG captures and the Dolphin logs hold the detailed results. A call PASS means the call answered; the gameplay evidence below rests on separate captures and observations.

| Check | Result |
| --- | --- |
| MCP negotiation and discovery of the 35 tools | PASS |
| Rejection of a write outside RAM | PASS |
| Fragmented transport, 64-bit precision, timeout, RAM bounds, port conflict, descriptor paths | 6 automated tests |
| WBFS launched by the MCP, ping, `SSPP52` identifier and an integer above 2^53 | PASS |
| Rewriting the same 8 bytes then reading them back exactly | PASS; no logical data change |
| Emulated Portal detected | PASS in the USB logs (`1430:0150`) |
| Figure loaded by `dolphin_load_figure`, recognised by the game | PASS; Sonic Boom shown with name and health bar in the first level |
| Effect of the Nunchuk inputs and their release in a playable scene | PASS; visible movement then a stop after the hold ends |
| Native save mid-game, progress, restore | PASS; slot 9, file of about 38 MB, restored scene observed by capture |
| Native pause and resume | PASS, checked against the toolbar |
| Riivolution replacement effective | **PASS**: the same `hbm/config.txt` file served at `0 kB` on the control boot and at `61 kB` on the patched boot (external file of 61 447 bytes), Dolphin file monitor, two distinct instances |
| Patched game still working | PASS; screen rendered after the boot, figure loaded into slot 1 by the MCP |
| Test instances closed | PASS with no forced kill on the last run; a forced kill is still reported when it happens |
| Integrity of the original figure | PASS; SHA-256 `15fee6e0…8cff39` identical before and after |

A first proof by a marker appended at the end of a file and searched for in RAM was abandoned: the game keeps only the first parsed line, so the absence of the marker proved nothing. The retained proof measures the size served by the patched disc's file system.

## M0 criteria and verdict

- Start SSA from a new MCP session and identify the right dump and the right profile: done.
- Reach a playable scene with a recognised Skylander, then demonstrate the effect of the Wiimote/Nunchuk inputs and their release: done.
- Capture that scene and its logs; save, let the scene progress, restore and check the expected return: done.
- Confirm the external file is read in a traceable Riivolution run, original dump preserved: done.
- Reproducible results for the required commands, unsupported functions identified: done (see the limits).

**M0: PASS.** No IGA reader/writer and no level editor were implemented during this step. Remaining limits: no exact stepping, a silent bridge during a native pause, native tools that depend on the interactive desktop and on the interface language, and `dolphin_reset` not validated.

## Reproduction

From `tools/dolphin-mcp`:

```powershell
npm ci --ignore-scripts
npm test
npm run smoke
node live-test.mjs
node live-test.mjs --patch
node prepare-m0-patch.mjs
npm run proof
```

`live-test.mjs` overwrites slot **9 of the research profile only**, starts SSA then closes its own instance. `--patch` needs the XML and the original file extracted into `.local/riivolution-smoke`. `prepare-m0-patch.mjs` regenerates the replacement file, the XML and the descriptor in `.local/riivolution-proof/`; `npm run proof` chains the control boot, the patched boot, the check on the served size, the rendering, the figure load and the stop, then writes `m0-proof.json` and updates `manifest.json`. Each script returns a non-zero code on failure.

`setup.ps1 -Register` reinstalls the pinned runtime, the locked dependencies and the Codex connection. Do not use it to overwrite another MCP connection called `dolphin` without checking where that one points. The WBFS, the figures, the saves and the evidence are not part of the distributed code.

## Integration sources

- [Felk fork and script loading](https://github.com/Felk/dolphin)
- [scripting-preview4 release](https://github.com/Felk/dolphin/releases/tag/scripting-preview4)
- [Python interfaces of that version](https://github.com/Felk/dolphin/tree/scripting-preview4/python-stubs/dolphin)
- [Community MCP reused for the base tools](https://github.com/dmang-dev/mcp-dolphin)
- [Riivolution descriptor format in the runtime](https://github.com/Felk/dolphin/blob/scripting-preview4/Source/Core/DiscIO/GameModDescriptor.cpp)
- [Riivolution external file resolution (`FileDataLoaderHostFS`)](https://github.com/Felk/dolphin/blob/scripting-preview4/Source/Core/DiscIO/RiivolutionPatcher.cpp)
- [Dolphin file monitor](https://github.com/Felk/dolphin/blob/scripting-preview4/Source/Core/Core/HW/DVD/FileMonitor.cpp)
- [Codex MCP configuration](https://developers.openai.com/codex/mcp)
