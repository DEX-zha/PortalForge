# Adding objects to a level

How the editor adds an object that the level does not contain, what stands behind the **Add** on a card, and how
the game ends up creating it. Feature [007](../../specs/007-unlimited-additions/spec.md); the boots behind every
claim are in its [validation](../../specs/007-unlimited-additions/validation.md).

Nothing here inserts a byte into a level file. An added object is created by the game itself, at run time, from a
record the level already holds.

## In the editor

Every object of the open level can be added, from the **Project** browser or the hierarchy: placed objects, stored
templates (the hidden "Templates and disabled objects" layer), and objects with nothing to draw (triggers, spawners,
cameras). Drop it where you want it; move or rotate the copy like any other object. A scene takes up to 590
additions: the first 59 can be compiled into the patch, and a larger scene is written into the running game by the
launch, batch after batch, so it needs to be launched from the editor.

The card says what is known about that source, and never more:

| On the card | Meaning |
|---|---|
| **Add** | a confirmed recipe: this exact source passed two identical boots and a review (nine tutorial sources) |
| **Add · verified in game** | a launch created it and read it back from the game's memory; the count of launches is in the tooltip |
| **Add · related source tested** | another object of the same family (same model, script and scale) was in the game; this one was not yet |
| **Add · lifecycle unclear** | it was created, and was gone before the end of the run: its own script removed or collected it |
| **Add · failed in game** | the last launch did not create it; the reason is in the tooltip. It can be added again |
| **Add · not verified** / **script not verified** | never launched yet |
| **Blocked** | cannot work: the source is itself an added copy, or its scale is not 100 % |

An addition whose source has no confirmed recipe is an **experimental addition**: it is marked as such in the
session, in the file saved next to the level and in the patch, and its proof is taken by every launch that carries
it ([constitution](../../.specify/memory/constitution.md) 1.2.0).

Things that the boots taught:

- **To add an enemy, add its template**, not the record that places it. A level keeps each enemy once as a stored
  template with a model and an enemy script (`Elemental_Swarmer`, `Enemy_ElementalHeavy`, …) and places it through
  model-less set-up records (`Intro_Elemental_Swarmer(1)`, …). A copied set-up runs its script and removes itself
  without leaving an enemy; a copied template stands where you put it and then behaves: on Mining the added
  swarmer ran sixteen units to the player within the opening dialogue.
- **Some objects remove themselves**: debris, dead automaton parts, actors of a closing cutscene. They read as
  "lifecycle unclear". That is their script, not a failed creation.
- **A level's singletons** (its Level Master, its cutscene directors) can be added like anything else, and copying
  one may hang the level. The launch records it; undo the addition.

## Save, Patch, Launch

- **Save** writes the level (unchanged by additions) and a sidecar `<level>.portalforge.json` holding the additions:
  the source's file offset, its model and script offsets, the position and heading, and `experimental`.
- **Patch** compiles the Gecko companion `portalforge-additions.ini` next to the Riivolution patch and records the
  options it was compiled with, so that the launcher installs exactly those bytes.
- **Launch** installs the companion into the research profile, boots, and reads every addition back from memory at
  each capture of the level, every fifteen seconds or so while you play, and at the end. The note at the end of a
  launch says how many were verified; the verdicts are filed per family under `.local/addition-validation/` and
  show on the cards. A missing experimental addition never stops the game.

## How the game creates them

The executable has a factory (`0x80041984`) that the game's own scripts use to clone a placement record: given a
source record, a position and an orientation expression, it returns a new placement instance with its own actor,
the source's model and script, and the source as its parent. The companion is a small PowerPC routine hooked into
the activation manager (`0x80062B88`), which runs with the level. It waits until the manager has observers and a
known placement of the level, the **anchor**, is active with an actor; then it walks a table and calls the factory
once per row. Every row is guarded: the source must carry the placement class pointer, the expected model and the
expected script, or the row is skipped. A wrong address therefore creates nothing rather than something wrong.

The confirmed tutorial recipes keep the context they were proven in: script-less sources are created at the return
of the game's own clone call (`0x800445C8`), scripted ones in the activation manager. Everything else, on every
level, goes through the activation manager.

Two things are specific to a level: the address its resident section is loaded at (**base**; a source is addressed
as base plus its file offset) and the anchor. Three layouts carry the rows:

| Layout | Per addition | Holds | Used when |
|---|---:|---:|---|
| `slot` | 144 bytes: the factory's argument block lives in the slot | 18 | up to 18 additions on a measured level; the only layout the nine confirmed recipes were proven with |
| `table` | 40 bytes, one shared argument block rebuilt before each call | 59 | past 18 additions on a measured level |
| `live` | the same rows, empty at boot | 59 per batch, refilled | a level that was never measured; any scene of more than 59 additions |

The ceiling is Dolphin's Gecko area: its code handler leaves 3 256 bytes for codes (the code list starts at
`0x80002338`), routine included.

## Measured levels, and levels never measured

- **The tutorial** sits at a constant place (`0x80DBC020`) and its anchor is the sunflower source: constants,
  validated by feature 005. Its compiled bytes are pinned by a test and must not change.
- **A level with a scene snapshot** (taken by *As in game → Capture*, or left by a previous launch) has been
  measured: the snapshot located the resident section and saw which placements were active. Its table is compiled
  into the patch, with a still, visible, script-less active prop as the anchor (Mining: the mine train). Such a
  patch also works when the game is played without the editor.
- **A level never measured** gets the `live` routine: the same bytes for every level, with an empty table. When the
  launch reaches the level it measures it, keeps that snapshot, and writes the table into the running game through
  the Dolphin bridge: the rows, then the anchor, then the count. The routine does nothing while the count is zero,
  so it never sees half a table. From then on the level is measured, and its next patch compiles the table in.

So additions work on a level the first time it is launched from the editor, with nothing to prepare.

**More than 59.** The routine attempts every row of its table in one pass, and the launcher can then read what it
wrote (for each row, the attempt word and the instance the factory returned), keep it, and write the next 59 rows
over them. The Gecko area bounds a batch, not a scene. The kept rows travel with the run (`options.rows`) so that
every later reading still finds the additions of the earlier batches. A patch that relies on this carries the live
routine even on a measured level; played without the editor, that routine finds an empty table and creates nothing.
The editor accepts 590 additions in a scene, which is a guard, not a measure of what the game can hold: 152 went in
on Mining through three tables, twice, and the game played on.

## What a launch checks

For each addition, from the game's memory (`inspectAdditions` in `native-run.mjs`): the row was consumed and the
factory returned an instance; the instance carries the placement class pointer, state 1, its own actor (distinct
from the source's and from every other addition's), the source as parent, the source's model and script, and the
position and heading that were asked for. The initial transform is checked apart from the current one, because an
enemy walks away from where it was created. Rendering is never inferred: look at the screen.

## Probes

Run from `tools/ssa-archive`, one Dolphin boot per invocation, twice for the two-boot rule:

```powershell
# a batch of sources on a level, laid out on a grid (beside the level's anchor when no --origin is given)
node research-probes/native-level-probe.mjs --level Level_000_Mining --auto 32 --visible --layout table
node research-probes/native-level-probe.mjs --level Level_000_Mining --origin 76,10.8,-47 --spacing 3 --columns 3 `
  --sources "Elemental_Swarmer,Elemental_Near_1,Enemy_ElementalHeavy"
# a level never measured: the run measures it and writes the batch into the game
node research-probes/native-level-probe.mjs --level Level_039_UndeadVolcano --auto 8 --visible
```

`--dry` plans and compiles without booting; `--scan 12` lists what the game itself created around the batch.

## Code map

| File (`tools/ssa-archive/src/editor/`) | Role |
|---|---|
| `native-patch.mjs` | the PowerPC routine and its three layouts; `nativeCapacity` measures what fits |
| `native-params.mjs` | a level's base and anchor: the tutorial's constants, or the newest scene snapshot |
| `native-live.mjs` | measuring a level at arrival and writing the table into the running game |
| `native-additions.mjs` | the session's additions: sources, the experimental mark, the sidecar, compile options |
| `native-run.mjs` | installing the companion in the research profile; reading additions back from memory |
| `native-watch.mjs` | what a run does about its additions: measure, read at each capture and in play, verdict |
| `addition-compatibility.mjs` | the evidence on a card: checks, status, family key |
| `addition-reports.mjs` | one verdict per addition per run, filed per family with its launches |
| `addition-campaign.mjs` | batches of sources in one boot, for experiments and campaigns |

## Not proven, not done

- Rendering was looked at for the added enemies only; combat, damage, loot and defeat are not judged.
- More than 59 additions when the game is played without the editor: a table outside the Gecko area
  ([study](../../specs/007-unlimited-additions/study-add-anything.md), step S08).
- Objects whose template is not in the level (an enemy of another level): phase C, gate M4A.
- Scales other than 100 %.
