# Direct tutorial entry

The editor offers **Direct level test, then close Dolphin** and **Direct level play, keep Dolphin open** for the SSPP52 Rev1 tutorial. Other levels keep the normal launch modes until a separate entry strategy is validated. See [the level matrix](../level-entry-status.json).

After **Save → Patch**, select a direct mode and launch. The first use prepares a local checkpoint automatically by navigating to the game slot before the tutorial loads. Subsequent launches restore this checkpoint, load the current patch and advance through the introductory dialogue. Test mode also moves the character and closes Dolphin; play mode leaves control to the player. **Stop** closes the editor-owned Dolphin.

In **Inspector → Playtest settings**, enable **Skip opening cinematic** to pass the tutorial opening using the game's own skip command. Leave it unchecked to watch the opening. The choice defaults to unchecked and is remembered in this browser. It applies to **Tutorial test**, **Direct level test** and **Direct level play**; it is disabled in **Normal play**, where you control the game manually. The choice also applies to automatic launches after patching. Changing it requires no new patch or checkpoint. Loading and the Skylander prompts still run normally.

Observed full test times: about185seconds with a cached entry and the opening retained, or134–136seconds with **Skip opening cinematic**, compared with279seconds through the menus. First preparation plus an eight-addition test took306seconds. Loading and Skylander prompts remain part of these times.

Preparation is repeated when the game, Dolphin executable, bridge, figure, relevant emulation settings or replacement file layout changes. Changing archive contents at the same file layout or changing native additions can reuse the checkpoint: it contains no loaded tutorial and no installed native recipe. Each run starts a new Dolphin process, loads the current Gecko accompaniment and requires evidence that the rebuilt archive was consumed after restoration. Reloading a level inside the same emulation does not rearm additions.

The checkpoint and manifest stay in `.local/level-entry/`. Slot8 belongs only to the research profile during the run; its previous contents are restored after the owned Dolphin stops. Game files, figures, savestates and screenshots are not committed.

## Why the earlier attempts failed

- A checkpoint made with the original WBFS had a different native file table from the rebuilt Riivolution disc. It produced incorrect file lookups and a black screen. Preparation now uses the patched virtual disc; FST hashes must match before and after restoration.
- An immediate restore followed by figure loading stalled at the slot screen in the failed experiment. The repeatable sequence waits for startup, loads the figure first, restores, reconnects the Wiimote and holds the transition input for60frames. The failure does not establish that figure order alone was the cause.
- A loaded tutorial savestate would restore old level bytes. It is never an entry strategy for previewing a changed archive. The proof uses a checkpoint prepared with different archive contents and checks the changed placement in native memory after entry.

No GDB or continuous instruction tracing is used. File consumption, native creation, visual review and gameplay remain separate results. Details and exact run identifiers are in [validation](../../specs/005-native-object-addition/validation.md).
