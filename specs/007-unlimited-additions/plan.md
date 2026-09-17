# Implementation Plan: Add any object, anywhere, as many times as wanted

**Branches**: one per phase | **Date**: 2026-09-17 | **Spec**: [spec.md](spec.md)

## Summary

Three mechanisms, ordered by how much they give for how little they risk, and one validation engine shared by all
of them. Everything is read from the game before it is written to the file, and every step ends in findings.

| Phase | Mechanism | What it gives | Cost | Risk |
|---|---|---|---|---|
| A | Native factory on every level, with a compact slot | any record of the current level, dozens per patch | 3 to 5 days, about 10 boots | low: the code is proven, only two addresses and a slot layout change |
| B | The activation flag as an on/off switch | remove any placed object; reveal any stored template at a chosen spot, one instance each | half a day, 4 boots | low: a one-word, same-size edit |
| C | Library import between levels | any enemy or object of the game in any level | 2 to 4 weeks of research, tens of boots | high: appending to the IGZ has never loaded; gate M4A |
| V | Campaign validation | proof for hundreds of sources without hand work | 2 to 3 days, then unattended boots | none |

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
- The Gecko area is 6 144 bytes (`GECKO_AREA`), of which 3 256 are reserved today for the additions; eight
  additions use 2 344 bytes because a slot is 144 bytes. The slot holds words the code writes at run time (attempt,
  pointer, ids) next to the request (position, heading, source, model, script).
- The IGZ loader constructs records by walking each header-table record's blob positionally; reflection rebases
  pointers but constructs nothing; the header table cannot grow in place; a runtime fixup map (`igz fixups`) lists
  every pointer word of a level once a resident dump exists, which the snapshot can now write.

## Constitution Check

M0..M3 PASS. Phase A widens a CONFIRMED recipe to other levels and to more sources: each level and each family is
promoted by its own boots, none by analogy. Phase B makes a new property editable only after its own two-boot
confirmations. Phase C is M4A research: no import is exposed as editable before a level has loaded with it twice.
The validation engine changes one rule and says so: a family is promoted by a batch in which every tested member
was verified, instead of one exact source per pair of boots; that amendment is proposed to the constitution below
and needs the user's decision. No IGZ insertion is attempted outside phase C's experiments, which run on copies.

## Phase A — Native additions on every level, without the cap of eight

1. **Per-level parameters from the snapshot.** `base` from the snapshot; `anchor` = the first record that is
   active with an actor on every snapshot of the level (Mining: `MineTrain`, `Level Master`); both stored with
   the level (`.local/dolphin-evidence/scene-snapshots/<level>/params.json`) and read by `compileNativePatch`.
   A level without them refuses to patch additions with the reason "take a scene snapshot first".
2. **Compact slot.** Split the request (source, model, script, position, heading, id: 32 bytes) from the run-time
   words (attempt, pointer, ids: 16 bytes) and pack them; measure the prologue once; capacity = floor((area −
   code) / slot). With the full 6 144-byte area and a 48-byte slot the expectation is above 90 additions; the
   number is measured, not assumed, and the view shows it.
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
4. **Cost.** Mining: 234 families, 32 per boot, two boots per batch → 16 boots, about 40 minutes unattended.
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
- The Gecko area is a hard budget of 6 144 bytes; if a compact slot does not reach the count the user wants, the
  next step is the flag of phase B, which costs nothing in code, and phase C, which needs no code at all.
- Cross-level objects that already exist in the target level (the 25 libraries present in thirty or more levels,
  Chompies in 16 to 19) need no import; the catalogue must say so before anyone waits for phase C.
