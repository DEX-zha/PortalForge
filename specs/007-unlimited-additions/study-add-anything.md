# Study: add anything now, verify fast, hold more

**Date**: 2026-09-17 (evening) | **Asked by the user** (translated): "Needs-test objects must be addable in every
level, and Blocked ones too; otherwise it is ultra slow and limiting. We have to find a fast way to verify. And how
do we get more additions?"

Nothing below was booted. Every number comes from the code, from memory dumps already on disk, or from Dolphin's
source; each proposal names the experiment that would prove it.

## 1. What is slow, measured

| Level | Placements | Add today | Needs test | Blocked |
|---|---:|---:|---:|---:|
| Tutorial | 673 | 9 | 438 | 226 |
| Mining | 617 | 0 | 363 | 254 |
| Sheep | 866 | 0 | 588 | 278 |

- **The gate is a precondition.** A source is addable only after a finding on two boots of that exact source. Nine
  sources confirmed since feature 005; 153 families wait on Mining alone.
- **Blocked has one cause.** Every blocked object on these three levels is blocked by the model check: 220 to 274
  records per level have no model record at all, 6 to 12 use the engine's invisible placeholder. These are the
  logic of a level: triggers, spawners, enemy set-ups, cameras, sound emitters, markers. Most enemies enter a level
  through such a record, so blocking them hides exactly what the user wants to add. The check exists because a
  capture cannot show an invisible object; memory can.
- **A boot costs two to four minutes**, almost all of it reaching the level. The verification itself reads a few
  kilobytes.

## 2. Verify at launch, not before adding

The launcher already reads every addition from the running game (`verifyNativeInstances`: class, state, actor,
parent, model, script, requested transform) at the captures and at the end of a run. That is the proof; today it is
only computed after the gate has already said yes. Turn the order around:

- **Any resident record can be added**, placed or stored, with or without a model, script or not. The card says
  what is known: *Verified in game (n launches)*, *Not verified yet*, *Failed last launch: reason*. Nothing is
  hidden and nothing is called confirmed that was not.
- **Every Launch verifies what it carries** and files the result per family (the report format of
  `addition-probe.mjs`). The user's own sessions are the campaign; no separate step, no extra time.
- **A family's evidence accumulates**: two launches that pass give the same two-boot evidence the rule asks for,
  without anyone running a test for it.
- What stays refused is what cannot work: a source that is itself an addition (its source is used instead), a
  level whose resident base is unknown (section 4 removes that), a request over the capacity.

Model-less sources need one change in the recipe: the model guard compares the record's model word with the
row's, and a record without a model holds zero, so the row carries zero. Scale other than 100 is the same kind of
change (the row carries the source's scale); both are verified by the launch that uses them.

This changes a constitutional rule ("UNKNOWN findings are never presented as editable properties"; a native recipe
needs "distinct visible instances on two cold boots"). The amendment to propose: *an addition from an unverified
source is an experimental addition: allowed, labelled as such on its card and in the patch, verified from memory by
every launch that carries it, and never reported as CONFIRMED before two launches passed.* It is the user's
decision, stated on 2026-09-17; it takes effect with the pull request that implements it.

## 3. Verify in seconds: write the table into the running game

Facts:

- The Gecko code handler re-reads its code list from memory every frame, and the recipe's routine creates every
  row whose attempt word is zero. Rows written later are created later.
- The bridge to the research Dolphin already writes memory (`memory.write_bytes`) and saves and loads savestates
  (`savestate.save_to_slot`, `load_from_slot`).
- The launcher's checkpoint is captured with no Gecko code installed (`clean_native`), so Dolphin installs the
  current code list after the restore. (Dolphin restores the handler's installation state with a savestate and does
  not re-install by itself: `GeckoCode.cpp`, `DoState`.)

So the routine can be made generic (the count, the anchor and the table address read from the header instead of
compiled in) and installed once; the table is then data the launcher writes while the game runs:

- **One boot verifies a whole level.** Reach the level, locate it in memory, write a batch of rows, wait a second,
  read the results, load the arrival savestate, write the next batch. Mining's 153 families are three batches of 59:
  about a minute after arrival instead of 18 boots.
- **No snapshot beforehand.** The base is located by the launcher at arrival with the snapshot's own method, and the
  anchor is any placement read active at that moment. Additions work on a level the first time it is launched.
- **No count limit while the editor drives the run.** When every row of the table reads "created", the launcher
  writes the next 59. The Gecko budget bounds a batch, not a scene.
- **A crash is a result.** A copy of a level's singleton (its Level Master, a cutscene director) may hang the level;
  the savestate brings it back and the family is filed as unsafe.

Experiment L1 (one boot, Mining): the generic routine with an empty table; after arrival write eight rows, read
them created; write eight more; load the savestate and write again. Proves live writing, refill and the savestate
loop.

## 4. Where the level sits: no static pointer, so locate it at arrival

Searched in the tutorial's full dump: no word of MEM1 is within 0x40 of the resident base (it is a virtual origin:
section address minus file offset), the start of section 1 is referenced once, from inside section 2, and no static
word points at an object holding it. A pointer chain from the executable's data would need more dumps from more
levels. The launcher locating the level at arrival (a position triple search, already written and proven on two
levels) needs nothing of the sort and is exact by construction.

For play without the editor attached, the base measured by the last launch is compiled in, as today; it was
identical on the two Mining runs that measured it and on every tutorial run.

## 5. More than 59 without the editor attached: a table outside the Gecko area

Measured in the dumps:

| Fact | Value |
|---|---|
| Gecko code list | starts at `0x80002338` (after Dolphin's handler), 3 272 bytes to `0x80003000`, of which 3 256 for codes |
| MEM2 usable end told to the game (`0x80003128`) | `0x935E0000`; IOS buffers to `0x93600000` |
| MEM2 never touched in the tutorial dump | 10.3 MB from `0x935E6000` to `0x94000000`, outside everything the OS hands out; 25 MB of zero pages in all |
| MEM1 | 2.6 MB of zero pages, but inside the game's arena: not usable |

From Dolphin's source (`Boot.cpp`, `CBoot::BootUp`): Riivolution `<memory>` patches are applied after the apploader
and the executable are loaded and before the game's first instruction. A patch can therefore lower the MEM2 arena
end at `0x80003128` before the game's `OSInit` reads it, which reserves memory through the OS's own words instead
of assuming it free; a second `<memory valuefile=…>` patch puts the table there. 256 KB hold 6 500 rows; the Gecko
area keeps only the routine (about 650 bytes).

- A checkpoint restores all memory, so the reservation has to be in the patch the checkpoint was made with (it
  becomes part of the checkpoint's identity), and the launcher rewrites the table after the restore.
- Experiment M1 (two boots): lower the arena end by 256 KB, write a marker block there at boot; the game plays a
  level, the marker is intact at the end, and the OS arena words read back the lowered value. M2: the routine reads
  its table from that block; 200 additions.
- The unknown is the game's own ceiling (actor pools, heap): a campaign measures it by adding until a creation
  fails, which the verification reports row by row.

The constitution asks for "handler-owned storage"; a block reserved through the OS arena is a different kind of
storage and needs the same amendment.

## 6. Order of work this suggests

| # | Step | Gives | Boots |
|---|---|---|---:|
| S1 | Add anything, verified by every launch; model-less and scaled sources; reports filed automatically | every object of every level addable today, with its evidence on the card | 0 to build, then the user's own launches |
| S2 | Generic routine, table written live, base located at arrival | no snapshot step; a whole level verified in one boot; no count limit with the editor attached | 1 (L1) |
| S3 | Table in reserved MEM2 | thousands of additions in plain play | 2 + 2 (M1, M2) |
| B | The activation flag as a switch | remove and reveal without any budget | 4 |
| C | Libraries between levels | objects of other levels | research |

A1 and A2 (eight additions on Mining with the compiled table, 32 with the compact one) stay the first boots: S2
builds on the compact table and its shared argument block.
