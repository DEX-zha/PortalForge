# Implementation Plan: Add any object, anywhere, as many times as wanted

**Branch**: `feat/007-unlimited-additions` | **Date**: 2026-09-17 | **Spec**: [spec.md](spec.md)

## Summary

Three mechanisms, ordered by how much they give for how little they risk, and one validation engine shared by all
of them. Everything is read from the game before it is written to the file, and every step ends in findings.

| Phase | Mechanism | What it gives | Cost | Risk |
|---|---|---|---|---|
| A | Native factory on every level, with a compact row | any record of the current level, up to 59 per patch | code done; 4 boots for A1 and A2 | low for the level parameters (data only); medium for the compact row, whose shared argument block is a hypothesis until A2 |
| B | The activation flag as an on/off switch | remove any placed object; reveal any stored template at a chosen spot, one instance each | half a day, 4 boots | low: a one-word, same-size edit |
| C | Library import between levels | any enemy or object of the game in any level | 2 to 4 weeks of research, tens of boots | high: appending to the IGZ has never loaded; gate M4A |
| V | Campaign validation | proof for hundreds of sources without hand work | 2 to 3 days, then unattended boots | none |

## Revised order (study of 2026-09-17, evening)

The user's answer to phase A was that a gate before adding is the wrong shape: everything must be addable now,
blocked objects included, and proof has to be fast. The [study](study-add-anything.md) found how, without a boot:
verify at launch instead of before adding (S1), write the table into the running game so one boot verifies a level
and the count exceeds a single table while the editor drives, up to the current 590 guard (S2), reserve MEM2 through the OS arena for thousands of
additions in plain play (S3). S1 to S3 come before phases B and C; A1 and A2 stay the first boots, because S2
builds on the compact table.

State on 2026-09-17, late: S1 and S2 are done and booted ([validation](validation.md)): the experimental addition,
the live routine that serves every level, and the refill that took 152 additions through three tables. What is
left of this plan, in order: S3 (a table outside the Gecko area, for play without the editor; its first half, the
reservation of memory through the OS arena, held on two boots with a control on 2026-09-17), the campaign with
savestates for objects with nothing to draw, phase B (the activation flag, its probe is ready), phase C (objects
of other levels). How the whole mechanism works is written for users and maintainers in
[docs/editor/adding-objects.md](../../docs/editor/adding-objects.md).

## Phase P — The Project tab and the game-wide catalogue (added 2026-09-17, late)

Goal: any object of the game can be found, and nothing the editor stores can be mistaken for another level's.

**Identity, three depths.** A *record* is `(level archive, file offset)`: unique on the disc, and the only thing an
addition's `source` may name. A *family* is per level (archive, model, script, scale): the key of a report, which
therefore never leaks between levels. A *kind* is new and crosses levels: the record's model and script paths
within the game's Content tree, lower-cased and hashed, so that a placed instance and the template it was cloned
from are one kind; a
record with neither falls back to its normalized bare name, so different names remain distinct while equal
fallback names group together without proving asset equivalence. The
libraries that carry a kind are attributes of it. Kind keys omit offsets. Family report keys include the probe version, original decoded-file digest, archive, model and script offsets and paths, and scale; they cannot be reused across arbitrary file revisions. Anything that points outside the open
level carries its level. Recounted on 2026-09-17 with full Content paths: 8 800 kinds in 75 levels (the title screen
has no placement),
6 578 of them in one level only, 83 in thirty levels or more; Mining holds 323, and 382 enemy kinds with a model
live only in other levels.

**Folders from the game's content tree.** A record says where it comes from: its library layer, and the
directory of its script (`Levels/_Enemies/Elemental_Swarmer`, `Levels/Includes/GameElement_PushBlock`,
`Levels/Level_000/Scripts`). Measured on Mining: 57 library layers, 49 script directories, 240 of 617 records in a
library. The tree: *Enemies / name*, *Game elements / name*, *Loot and treasure*, *Destructibles*, *Shared
libraries / name*, *This level / its own layer*, *Logic / layer* for records with nothing to draw. The server
computes the folder of each catalogue entry (`object-kinds.mjs`); the view draws what it is given and the regex on
names in `asset-folders.mjs` goes away.

**The game-wide catalogue** (`game-catalogue.mjs`, `edit catalogue`): one pass over the decoded levels, one entry
per kind with the levels that hold it, how many records, and whether a stored template exists; cached in
`.local/catalogue/kinds.json` with each level's digest, rebuilt per level on a digest change. `GET /api/library`
serves it against the open level: *here* (with this level's record to add from) or *elsewhere* (with the levels).

**No conflict by construction.** Foreign kinds are read-only cards: they cannot be dragged, and no intent carries
a record of another level. The day phase C imports a library, the imported records get offsets in the open level
and are ordinary sources. Showing evidence seen on other levels as "verified on N other levels", apart from this
level's verdict, remains T006; current foreign cards only show which levels hold the kind.

Built on 2026-09-17: `object-kinds.mjs`, `game-catalogue.mjs`, `edit catalogue`, `GET` and `POST /api/library`,
the scope switch of the Project pane. The whole catalogue builds in about seven seconds.

**The census** (FR-012) is implemented in the research probe; integration into every editor launch remains T002: the level's own placements that are active
with an actor, at arrival and at each reading; a control boot gives the level's own drift.

## Technical Context

- The native recipe (`src/editor/native-patch.mjs`) is PowerPC emitted as Gecko lines: a fixed prologue, guards
  waiting for the activation manager's observer list and for an anchor placement to be active, then a loop over
  `additions.length` slots, each calling the game's factory (`0x80041984`) with the source record, the position
  and the heading, and keeping the returned instance. Tutorial-bound: `NATIVE_BASE = 0x80DBC020` and the anchor
  `0x81105604`. Level-independent: the hooks (`0x800445C8`, `0x80062B88`), the factory, the placement class
  `0x80481674`, the activation manager.
- The scene snapshot (`src/editor/scene-snapshot.mjs`) locates a level's resident section (Mining
  `0x80DC6F48`) and reads every record's state and actor: it gives the base and a set of always-active records
  to anchor on, per level, in one boot.
- The Gecko area is 6 144 bytes (`GECKO_AREA`); Dolphin's code handler takes the start of it and 3 256 bytes
  are left for codes (`GECKO_CODE_BUDGET`), a hard budget. Eight mixed additions use 2 344 of them because a slot
  is 144 bytes: it is the factory's argument block itself (the position, and a native orientation expression
  object evaluated through `0x8005C4D0`), next to the words the code writes at run time.
- On the tutorial a script-less source is created from a hook at `0x800445C8`, the return of the game's own
  clone call, and a scripted one from the activation manager (`0x80062B88`). The first only runs when a script
  clones something; the second runs with the level. Other levels use the second for every source.
- The IGZ loader constructs records by walking each header-table record's blob positionally; reflection rebases
  pointers but constructs nothing; the header table cannot grow in place; a runtime fixup map (`igz fixups`) lists
  every pointer word of a level once a resident dump exists, which the snapshot can now write.

## Constitution Check

M0..M3 PASS. Phase A widens a CONFIRMED recipe to other levels and to more sources: each level and each family is
promoted by its own boots, none by analogy. Phase B makes a new property editable only after its own two-boot
confirmations. Phase C is M4A research: no import is exposed as editable before a level has loaded with it twice.
Constitution 1.2.0 (2026-09-17, the user's decision) defines the experimental addition: any source may be added
with the confirmed recipe, marked as experimental and verified from memory by every run that carries it; it is
never reported as confirmed, and a family still becomes a finding only through two identical boots and review. No IGZ insertion is attempted outside phase C's experiments, which run on copies.

## Phase A — Native additions on every level, without the cap of eight

1. **Per-level parameters from the snapshot** (`native-params.mjs`, done). `base` is the snapshot's; `anchor`
   is a placement the snapshot saw active with an actor, a still, visible, script-less prop first because that
   is what the tutorial's anchor is (Mining: `MineTrain`). They are derived from the newest snapshot every time,
   not stored apart, so they cannot drift from it; a snapshot of another version of the level is refused. Phase S supersedes the initial snapshot requirement: an unmeasured level uses the live table.
   The compiled code guards against mismatched source addresses by checking
   the class pointer, the model and the script of every source before it calls the factory.
2. **Compact row** (`layout: 'table'`, implemented; A2 booted twice, LIKELY). The request (id, position, source, heading, model,
   script) and the two result words make a 40-byte row; one shared 144-byte argument block is zeroed and rebuilt
   from the row before every call, so the factory sees what the proven slot showed it. Measured capacity: 18
   additions with the proven slot, 59 with the table. The hypothesis to prove in A2 is that the factory keeps
   no pointer into the argument block after it returns; the heading check on every instance would show it.
   The tutorial's compiled bytes are pinned by a test against the output recorded before the change.
3. **Any resident source.** Drop the nine-source whitelist: a source is admissible when its record is resident
   (placed or template), including records without a drawable model under phase S; its card shows its family's status. Templates are the natural sources
   (the game clones them itself), placed records are what the tutorial proved.
4. **Experiments.** A1: eight sunflower-class additions on Mining with the snapshot's base and anchor (two boots)
   → SC-001. A2: 32 additions of 32 families on Mining (two boots) → SC-002. A3: the campaign of phase V over
   Mining's templates → SC-003.

## Phase B — The activation flag as a switch

1. `applyEdit({ kind: 'activation', target, active })` writes bit 0 of +0x54 (4 ↔ 5); the save plan authorises
   that single word; the inspector offers "Remove from the level" on placed records and "Place this template
   here" on stored ones, the latter combined with a transform.
2. Experiments. B1: `Barrel(20)` and one Chompy setup placed → stored, two boots: gone. B2: `Rock_Breakable_Half`
   and `Mine_Train_Template` stored → placed and moved in front of the opening camera, two boots: standing there.
   Failure modes to record: a revealed template that its cloning script still needs; a removed object that a
   script expects (a key, a gate).
3. Finding `level.placement.activation-switch`, editable on CONFIRMED.

## Phase C — Libraries between levels (M4A)

The only route to "any enemy anywhere". Staged so that each step either loads or teaches something.

1. **C0 — Catalogue of what exists where.** Phase P: for every kind, the levels holding it and its templates; the
   Project tab shows, for a kind not in the open level, the levels that hold it. Zero boots. It also tells how
   much of "any object anywhere" needs no import at all: a kind present in the open level is added from there.
2. **C1 — Table growth on copies.** Rebuild a level with its header table enlarged by k entries pointing at k
   appended copies of an existing placement blob at the end of section 1, every pointer word rebased from that
   level's runtime fixup map (taken from the snapshot's resident dump), section-5 words included. One boot tells
   whether a shifted, otherwise identical level loads and constructs the copies. Loads: duplication without a
   victim on any level (SC-005 becomes reachable). Hangs: the shift must be avoided by reserving table slack in
   a level once (the same experiment with the table padded rather than grown), and if that hangs too, phase C
   stops at C1 with the finding that says why.
3. **C2 — A library's records.** Append one small library's records (a static prop with one model) from level B
   to level A: placement, model record, geometry blocks (sections 5 and 6), textures (section 4), names
   (section 2), type-table entries when B's classes are absent from A's table. One boot per attempt; the first
   target is a prop with no script.
4. **C3 — Scripts and sounds.** The same with a scripted enemy: its script, its `.ai` strings, its
   sound bank in section 8. The script class and clone-list layouts are now detected per file for read-only
   diagnostics (C06); importing and relocating those records remains to be tested.
5. Gate M4A PASS when a level loads with an imported library on two boots and phase A clones its template.

## Phase V — Validation without hand work

1. **Batches.** A campaign takes a level, a list of sources (one member per untested family, up to the slot
   capacity), builds one patch, boots twice, and for each instance reads memory (class `0x80481674`, state 1,
   actor present, position and heading within 0.05 of the request) at three moments (arrival, +20 s, +60 s) and
   takes captures with the additions in view. Every check is machine-made; the captures are kept for review.
2. **Judgement.** Runtime reports distinguish attempted creation, returned instances, initial transforms and
   later survival. AI or animation can move an instance, and a script may remove it after successful creation.
   Captures require human review; memory results alone do not establish visible behavior.
3. **Findings.** Reports are grouped per family and level for navigation. They never promote all members or
   alter source eligibility. Only a reviewed, source-specific recipe can become CONFIRMED after two identical
   boots, proven consumption and a visible result. The former family-promotion proposal is superseded by
   constitution 1.2.0 (V02/T011); finding-draft generation remains T010.
4. **Coverage.** R1 created 152 additions from Mining's families with drawable models on two boots using three
   live batches. Coverage of remaining model-less families and singletons stays S07/V03; the tutorial campaign
   stays V04. Counts of families depend on the catalogue/filter used, not on a universal fixed number.

## Project Structure

- `specs/007-unlimited-additions/`: spec, plan, research, tasks; contracts and validation as phases complete.
- `tools/ssa-archive/src/editor/native-patch.mjs`, `native-additions.mjs`, `native-run.mjs`: phase A.
- `tools/ssa-archive/src/editor/session.mjs`, `save.mjs`, `safety.mjs`, the view: phase B.
- `tools/ssa-archive/src/igz/relocate.mjs`, `writer.mjs`, new `import.mjs`: phase C.
- `tools/ssa-archive/src/editor/addition-probe.mjs`, `addition-compatibility.mjs`: phase V.

## Complexity Tracking

- Phase C is where the weeks go. C1 is the decisive experiment and costs one boot once the fixup map of a level
  exists; the plan spends nothing on C2 before C1 loads.
- The Gecko budget is 3 256 bytes and 59 additions is one compact table's ceiling. The live refill
  exceeds it under editor control; S09 researches an independent table in reserved memory. Phases B and C
  change files and do not themselves solve runtime storage.
- Cross-level objects that already exist in the target level (the 25 libraries present in thirty or more levels,
  Chompies in 16 to 19) need no import; the catalogue must say so before anyone waits for phase C.
