# Implementation Plan: Add any object, anywhere, as many times as wanted

**Branches**: one per phase | **Date**: 2026-09-17 | **Spec**: [spec.md](spec.md)

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
and the count is unbounded while the editor drives (S2), reserve MEM2 through the OS arena for thousands of
additions in plain play (S3). S1 to S3 come before phases B and C; A1 and A2 stay the first boots, because S2
builds on the compact table.

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
   not stored apart, so they cannot drift from it; a snapshot of another version of the level is refused. A level
   without them refuses with "take a scene snapshot first". A wrong base cannot do harm: the compiled code checks
   the class pointer, the model and the script of every source before it calls the factory.
2. **Compact row** (`layout: 'table'`, done, unproven). The request (id, position, source, heading, model,
   script) and the two result words make a 40-byte row; one shared 144-byte argument block is zeroed and rebuilt
   from the row before every call, so the factory sees what the proven slot showed it. Measured capacity: 18
   additions with the proven slot, 59 with the table. The hypothesis to prove in A2 is that the factory keeps
   no pointer into the argument block after it returns; the heading check on every instance would show it.
   The tutorial's compiled bytes are pinned by a test against the output recorded before the change.
3. **Any resident source.** Drop the nine-source whitelist: a source is admissible when its record is resident
   (placed or template) and has a model; its card shows its family's status. Templates are the natural sources
   (the game clones them itself), placed records are what the tutorial proved.
4. **Experiments.** A1: eight sunflower-class additions on Mining with the snapshot's base and anchor (two boots)
   → SC-001. A2: 32 additions of eight families on Mining (two boots) → SC-002. A3: the campaign of phase V over
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

1. **C0 — Catalogue of what exists where.** From the census: for every library, the levels holding it and its
   templates; the editor's Project shows, for an object not in the current level, "in 12 levels: Castle, Dungeon…".
   Zero boots.
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
4. **C3 — Scripts and sounds.** The same with a scripted enemy: its type-92 script, its `.ai` strings, its
   sound bank in section 8. The script class must be detected per file first (the known defect in `script.mjs`).
5. Gate M4A PASS when a level loads with an imported library on two boots and phase A clones its template.

## Phase V — Validation without hand work

1. **Batches.** A campaign takes a level, a list of sources (one member per untested family, up to the slot
   capacity), builds one patch, boots twice, and for each instance reads memory (class `0x80481674`, state 1,
   actor present, position and heading within 0.05 of the request) at three moments (arrival, +20 s, +60 s) and
   takes captures with the additions in view. Every check is machine-made; the captures are kept for review.
2. **Judgement.** A source passes when both boots pass all checks; a family passes when every tested member
   passed; a level's campaign report lists families passed, failed with the failing check, and untested.
3. **Findings.** One record per family per level (`level.prop.native-addition.<level>.<family>`), CONFIRMED on two
   boots; a later failure of any member demotes the family to UNKNOWN with the run kept.
4. **Cost.** Mining has 153 testable families (108 of them stored templates only, 29 dormant only, 16 with an
   active member): three batches of 59 with the table layout, six boots, about 20 minutes unattended; nine
   batches and 18 boots with the proven slot.
5. **Rule change.** Today a family result never promotes its members ("Family tests do not grant Add
   automatically"). The proposal: a family is promoted when every tested member passed on two boots and the
   family shares model and script; the constitution and `AGENTS.md` record it if accepted.

## Project Structure

- `specs/007-unlimited-additions/`: spec, plan, research, tasks; contracts and validation as phases complete.
- `tools/ssa-archive/src/editor/native-patch.mjs`, `native-additions.mjs`, `native-run.mjs`: phase A.
- `tools/ssa-archive/src/editor/session.mjs`, `save.mjs`, `safety.mjs`, the view: phase B.
- `tools/ssa-archive/src/igz/relocate.mjs`, `writer.mjs`, new `import.mjs`: phase C.
- `tools/ssa-archive/src/editor/addition-probe.mjs`, `addition-compatibility.mjs`: phase V.

## Complexity Tracking

- Phase C is where the weeks go. C1 is the decisive experiment and costs one boot once the fixup map of a level
  exists; the plan spends nothing on C2 before C1 loads.
- The Gecko budget is 3 256 bytes and 59 additions is its measured ceiling with this recipe; beyond that, the
  flag of phase B costs nothing in code and phase C needs no code at all.
- Cross-level objects that already exist in the target level (the 25 libraries present in thirty or more levels,
  Chompies in 16 to 19) need no import; the catalogue must say so before anyone waits for phase C.
