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
      limit stayed eight at this stage; S02/S05b superseded it with experimental additions and the 590 guard.
- [x] A03 Any resident source as a test candidate: a level with snapshot parameters classifies its objects as
      "Needs test" instead of "Blocked" (Mining: 153 testable families); Add stays reserved to confirmed
      recipes at this stage; S02 superseded that gate. The one-source probe of the tutorial refuses other levels and names the batch probe.
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
      evidence: confirmed, verified in game, related source tested, failed in game, not verified. A source at another scale is blocked. The original snapshot requirement was removed by S05.
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
- [x] S05b Refill (`writeLiveBatches` in `native-live.mjs`): a scene larger than the table is written batch by
      batch; each batch but the last is waited for, read (attempt word and instance) and kept in `options.rows`
      before it is overwritten, so every later reading still finds it. A scene of more than 59 additions patches
      the live routine even on a measured level; the editor accepts 590 (`ADDITION_LIMIT`, a guard).
- [x] S06 Experiment L1 on 2026-09-17: two identical boots on Undead Volcano, never measured before, 8 of 8
      created by the live routine (6 alive at every reading, 2 removed by their scripts); one boot on
      `Challenge_Level_005` ([validation](validation.md)).
- [x] S06b Experiment R1 on 2026-09-17: two boots of 152 additions on Mining (every family with a visible model)
      through three tables of 59; the factory returned an instance for 152 of 152 on both boots.
- [ ] S07 Level campaign with a savestate between batches, for the families R1 left out: objects with nothing to
      draw, among which a level's singletons; a family that hangs the level is filed as unsafe.
- [x] S08 Experiment M1 on 2026-09-17: the MEM2 arena end lowered by a Riivolution memory patch, a 256 KB block
      intact at every reading of two boots, and overwritten entirely in the control boot that did not lower it.
      The patch builder writes memory patches (`riivolution.mjs`, research only) and a checkpoint's identity covers
      them (`level-entry.mjs`). Probe: `research-probes/arena-reserve-boot.mjs`.
- [ ] S09 Table in the reserved block, delivered by `<memory valuefile>` and rewritten after a checkpoint
      restore; experiment M2, two boots, 200 additions.

## Phase P — The Project tab and the game-wide catalogue

- [x] P01 `object-kinds.mjs`: the kind of a record (model path and script path; bare name when it has neither) and
      its folder, from its library layer and its script directory. Display names do not decide folders; bare names distinguish model-less, script-less kinds.
- [x] P02 Every entry of `/api/catalog` carries `folder` and `kind`; `src/view/asset-folders.mjs` draws what it is
      given and the regex on names is gone.
- [x] P03 `game-catalogue.mjs`, `edit catalogue`, `GET` and `POST /api/library`: 8 800 kinds in 75 levels in about
      seven seconds, kept under `.local/catalogue/` with each level's digest.
- [x] P04 The Project pane's scope switch: This level, Whole game. A kind held here is this level's own entry; a
      kind held elsewhere is a read-only card without an offset, naming the levels that hold it.
- [x] P05 The census reading of the probe (`--census`) and its two boots on Mining (one addition, 152 additions).

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

- [x] C01 Superseded by P01–P04: the catalogue groups kinds by full model/script paths with their libraries,
      templates and levels; foreign cards show their levels without becoming addable. No import is implied.
- [ ] C02 Runtime fixup map per level from the snapshot's resident dump (`igz fixups` on the dump the snapshot
      writes); stored under `.local/dolphin-evidence/runtime-maps/<level>.json`, which the editor already reads.
      One snapshot per level.
- [ ] C03 Experiment C1, one boot: Mining rebuilt with its header table grown by four entries pointing at four
      appended copies of a placement blob, every pointer rebased from C02's map. Record the outcome as a finding
      whatever it is.
- [ ] C04 If C1 loads: `igz append` command and the editor's "Duplicate without a victim"; two boots.
- [ ] C05 Experiment C2: one static library (a prop with one model) from one level into another; the sections
      involved (1, 2, 4, 5, 6) and the type table; one boot per attempt.
- [x] C06 Detect the script class per file (`src/igz/script.mjs`, `script-diagnostics.mjs`) from the header-table
      layout; recognise clone lists and owner expressions structurally. An offline corpus pass read all scripts
      without a layout issue in 75 levels (20 distinct class indices); Tutorial (92), Mining and Castle (86)
      also find clone resources. This is read-only and does not establish cross-level script import.
- [ ] C07 Experiment C3: one scripted enemy library imported, with its script and sound bank; boots as needed.
- [ ] C08 Gate M4A and the findings; the Project browser offers other levels' objects when C2 holds.

## Phase V — Validation without hand work

- [x] V01 Batch campaigns (`src/editor/addition-campaign.mjs`, `research-probes/native-level-probe.mjs`): one
      patch of up to the capacity through the editor's builder and launcher, every addition inspected from memory
      at each capture of the level and at the end, one result file per boot, family reports from two boots of the
      same batch. Tests with a fake builder and runner. The editor's Test button still drives the tutorial only.
- [x] V02 Closed as superseded: constitution 1.2.0 permits experimental additions and explicitly rejects
      automatic promotion from a family report. Confirmation remains source-specific and reviewed.
- [ ] V03 Complete Mining coverage beyond R1's 152 drawable-model sources; model-less families and singletons
      remain S07. Keep creation, survival and visual review separate; reports do not promote recipes.
- [ ] V04 Campaign over the tutorial's remaining families; retain the nine exact confirmed sources and their
      original scope. New members remain experimental until individually reviewed.

## Dependencies

A01 → A02 → A03 → A04 → A05 → A06. S01 → S02 → S03; S04 → S05 → S06 → S07, after A05; S08 → S09. B01 → B02 → B03/B04 → B05, independent of A. C01 and C02 first; C03 decides
C04; C05 after C03 loads; C06 before C07; C08 closes. V01 → V03 → V04, and V03 needs A03. V02 is closed as superseded.

## Phase 6: Convergence

Appended on 2026-09-17 by a convergence pass (`speckit-converge`): what `spec.md`, `plan.md` and the constitution
ask for and the code does not do yet, beyond the tasks still open above (B01 to B05, C02 to C08, S07/S09 and V03/V04). The audit subsequently closed C01, V02 and T011 with explicit
supersession; task identifiers are retained.

- [x] T001 Reword FR-001 in `spec.md`: a level without a snapshot is no longer refused, its first launch measures it (`native-live.mjs`); the requirement now matches the code per FR-001.
- [ ] T002 Take the census in the editor's own launch, not only in `research-probes/native-level-probe.mjs`: count the level's own active objects at arrival and at each reading in `native-watch.mjs`, keep it in the run record and show it in the launch note per FR-012 (partial)
- [ ] T003 Reserve the table's memory through the OS arena in a patch the editor builds, and deliver a compiled table there for play without the editor, in `native-patch.mjs`, `save.mjs` and `patch-build.mjs`, once experiment M1 has held on two boots per FR-013 (missing)
- [ ] T004 Amend constitution III for storage reserved through the OS arena (today it names "handler-owned storage" only), with `AGENTS.md` and the plan's Constitution Check, in the change that lands T003 per Constitution III (missing)
- [ ] T005 Make the Project pane's Test buttons run a level batch (`addition-campaign.mjs`) on a level other than the tutorial instead of refusing with the probe's name, in `server.mjs` and `src/view/catalog.mjs` per plan: Phase V (partial)
- [ ] T006 Show on a kind's card the evidence seen on other levels ("verified on N other levels") apart from this level's verdict, from the family reports, in `game-catalogue.mjs` and `src/view/asset-folders.mjs` per plan: Phase P (missing)
- [ ] T007 Boot the census a second time for each side (one addition, 152 additions) and record both pairs in `validation.md` per SC-006 (partial)
- [ ] T008 Boot the classic-play path of the live routine, where the level is reached by hand and the measure is triggered by the archive being read, and one hub and one PvP level through the redirect, and record them in `validation.md` and `docs/level-entry-status.json` per US1/AC1 (partial)
- [ ] T009 Add a corpus check that skips without local samples: on every decoded level each record falls in exactly one folder and the game catalogue covers every level but the title screen, in `tests/` per SC-007 (partial)
- [ ] T010 Add a command that turns a family's report into a finding draft with its run ids for review, in `src/cli/commands/` per FR-004 (partial)
- [x] T011 Documentation audit: V02 closed as superseded; V03 narrowed to coverage absent from R1; V04 retains source-specific review. No capability was promoted.
