# Tasks: Add any object, anywhere, as many times as wanted

**Input**: design documents from `/specs/007-unlimited-additions/`. Tests first. Boot budgets are stated per task
and every boot waits for the user's go-ahead. Paths are relative to the repository root.

## Phase A — Native additions on every level

- [x] A01 Per-level parameters (`src/editor/native-params.mjs`): base and anchor derived from the newest scene
      snapshot, never stored apart; `compileNativePatch(additions, { base, anchor, context, layout, limit })`
      refuses without an anchor; the options travel with the patch so the installer recompiles the same bytes;
      the runtime verification reads from the level's base. The tutorial's output is pinned byte for byte.
- [x] A02 Compact row (`layout: 'table'`): 40 bytes per addition and one shared argument block; `nativeCapacity`
      measures 18 (slot) and 59 (table); the catalogue reports the confirmed limit and what fits. The editor's
      limit stays eight until a capacity finding says otherwise.
- [x] A03 Any resident source as a test candidate: a level with snapshot parameters classifies its objects as
      "Needs test" instead of "Blocked" (Mining: 153 testable families); Add stays reserved to confirmed
      recipes. The one-source probe of the tutorial refuses other levels and names the batch probe.
- [x] A04 Experiment A1, two boots on 2026-09-17: eight additions on Mining with the snapshot's base and anchor,
      four from active placements and four from stored templates, one of them script-less. 8 of 8 created on both
      boots, the same compiled recipe ([validation](validation.md)).
- [x] A05 Experiment A2, two boots on 2026-09-17: 32 additions of 32 families with the table layout. 32 of 32
      created on both boots, each with its own heading; the same ten removed afterwards by their own scripts.
- [x] A06 Findings `level.prop.native-addition-other-levels` and `level.prop.native-addition-table-layout`, both
      LIKELY: memory proves creation, nobody has looked at the screen yet. CONFIRMED needs that look (a direct-play
      launch) and, for other levels, their own boots.

## Phase S — Add anything, verify fast, hold more ([study](study-add-anything.md))

- [x] S01 Constitution 1.2.0 and `AGENTS.md`: the experimental addition (allowed, marked, verified by every run
      that carries it, never called confirmed). Storage reserved through the OS arena waits for S08.
- [x] S02 Any resident record addable (`native-additions.mjs`, `addition-compatibility.mjs`): the recipe lookup no
      longer gates; a source without its own confirmed recipe gives an addition marked `experimental`, created from
      the activation manager; objects with nothing to draw carry a zero model word; an addition of an addition is
      refused with the reason; past 18 additions the scene compiles as the table layout. Cards say Add with the
      evidence: confirmed, verified in game, related source tested, failed in game, not verified. Only a level
      without a scene snapshot, or a source at another scale, is blocked.
- [x] S03 Every run inspects its additions row by row at the captures of the level, during play and at the end
      (`inspectAdditions`), a run with experimental additions goes on when one is missing, and the launch files the
      verdict per family with its launches (`addition-reports.mjs`); the launch note says how many were verified.
- [x] S03a First use on enemies: four model-less enemy set-ups of Mining (`Intro_Elemental_Swarmer(1)`,
      `Intro_Elemental_Near(6)`, `Intro_Elemental_Heavy(1)`, `Intro_Enemy_Thief(1)`) were created, 4 of 4, then
      removed themselves once their script had run; what they leave behind is read by `--scan`.
- [x] S04 Generic routine (`layout: 'live'` in `native-patch.mjs`): the count and the anchor are header words, the
      59 rows are empty at boot, an empty table is inert, and the bytes are the same for every level. The
      tutorial's compiled recipe is unchanged (pinned test).
- [x] S05 Live table (`native-live.mjs`, `native-watch.mjs`): a level never measured patches the live routine; the
      launch measures the level at the first capture of it (or, in classic play, once its archive has been read),
      keeps the measure as the level's scene snapshot, and writes rows, anchor, then count. No level needs a
      snapshot beforehand any more; a measured level still compiles its table in.
- [ ] S05b Refill: write the next 59 rows once the first are created, keeping each batch's instance pointers for
      the readings; the savestate loop of a level campaign.
- [x] S06 Experiment L1 on 2026-09-17: two identical boots on Undead Volcano, never measured before, 8 of 8
      created by the live routine (6 alive at every reading, 2 removed by their scripts); one boot on
      `Challenge_Level_005` ([validation](validation.md)).
- [ ] S07 Level campaign in one boot: every family of the level in batches with the arrival savestate between
      them; families that hang the level filed as unsafe.
- [ ] S08 Experiment M1, two boots: MEM2 arena end lowered by a Riivolution memory patch, marker block intact.
- [ ] S09 Table in the reserved block, delivered by `<memory valuefile>` and rewritten after a checkpoint
      restore; experiment M2, two boots, 200 additions.

## Phase B — The activation flag as a switch

- [ ] B01 `applyEdit` kind `activation`, save-plan authorisation of the single word, safety rule for scripted
      dependencies (a template a script clones, an object a script expects). Tests on the synthetic level.
- [ ] B02 Inspector actions "Remove from the level" and "Place this template here"; the Project browser lists
      templates as placeable with that action.
- [x] B00 The probe (`research-probes/activation-flag-boot.mjs`): flips the flag word on a copy, checks that no other
      word moved, boots through the redirect and reads each target's state and actor from memory. The flag is not
      an editor property until B05.
- [ ] B03 Experiment B1, two boots: the two lanterns of Mining's opening view switched off
      (`--off "Lantern_01,Lantern_01(1)"`); they are known to be in the captures (feature 006).
- [ ] B04 Experiment B2, two boots: `Rock_Breakable_Half` revealed at a chosen spot on Mining
      (`--on "Rock_Breakable_Half" --at 80,10.9,-47`).
- [ ] B05 Finding `level.placement.activation-switch`; editable on CONFIRMED; documentation.

## Phase C — Libraries between levels

- [ ] C01 Catalogue: for every library, the levels holding it and its templates (from the census); Project shows
      "in N levels" for objects absent from the current level. Zero boots.
- [ ] C02 Runtime fixup map per level from the snapshot's resident dump (`igz fixups` on the dump the snapshot
      writes); stored under `.local/dolphin-evidence/runtime-maps/<level>.json`, which the editor already reads.
      One snapshot per level.
- [ ] C03 Experiment C1, one boot: Mining rebuilt with its header table grown by four entries pointing at four
      appended copies of a placement blob, every pointer rebased from C02's map. Record the outcome as a finding
      whatever it is.
- [ ] C04 If C1 loads: `igz append` command and the editor's "Duplicate without a victim"; two boots.
- [ ] C05 Experiment C2: one static library (a prop with one model) from one level into another; the sections
      involved (1, 2, 4, 5, 6) and the type table; one boot per attempt.
- [ ] C06 Detect the script class per file (`src/igz/script.mjs`, `script-diagnostics.mjs`), the known defect.
- [ ] C07 Experiment C3: one scripted enemy library imported, with its script and sound bank; boots as needed.
- [ ] C08 Gate M4A and the findings; the Project browser offers other levels' objects when C2 holds.

## Phase V — Validation without hand work

- [x] V01 Batch campaigns (`src/editor/addition-campaign.mjs`, `research-probes/native-level-probe.mjs`): one
      patch of up to the capacity through the editor's builder and launcher, every addition inspected from memory
      at each capture of the level and at the end, one result file per boot, family reports from two boots of the
      same batch. Tests with a fake builder and runner. The editor's Test button still drives the tutorial only.
- [ ] V02 The promotion rule (family passes when every tested member passed on two boots, same model and
      script) proposed to the constitution; applied only once accepted.
- [ ] V03 Campaign over Mining's 153 families (six boots with the table layout, unattended); reports written by the
      tool, findings after review.
- [ ] V04 Campaign over the tutorial's 234 families with the same tool; the nine hand-confirmed sources become
      family findings.

## Dependencies

A01 → A02 → A03 → A04 → A05 → A06. S01 → S02 → S03; S04 → S05 → S06 → S07, after A05; S08 → S09. B01 → B02 → B03/B04 → B05, independent of A. C01 and C02 first; C03 decides
C04; C05 after C03 loads; C06 before C07; C08 closes. V01 → V02 → V03 → V04, and V03 needs A03.
