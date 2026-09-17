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
- [ ] A04 Experiment A1, two boots: eight sunflower-class additions on Mining with the snapshot's base and anchor.
- [ ] A05 Experiment A2, two boots: 32 additions across eight families on Mining, all verified in memory.
- [ ] A06 Findings `level.prop.native-addition.<level>` per level booted; the tutorial keeps its own.

## Phase B — The activation flag as a switch

- [ ] B01 `applyEdit` kind `activation`, save-plan authorisation of the single word, safety rule for scripted
      dependencies (a template a script clones, an object a script expects). Tests on the synthetic level.
- [ ] B02 Inspector actions "Remove from the level" and "Place this template here"; the Project browser lists
      templates as placeable with that action.
- [ ] B03 Experiment B1, two boots: `Barrel(20)` and one Chompy setup removed on Mining.
- [ ] B04 Experiment B2, two boots: `Rock_Breakable_Half` and `Mine_Train_Template` revealed in front of the
      opening camera on Mining.
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

A01 → A02 → A03 → A04 → A05 → A06. B01 → B02 → B03/B04 → B05, independent of A. C01 and C02 first; C03 decides
C04; C05 after C03 loads; C06 before C07; C08 closes. V01 → V02 → V03 → V04, and V03 needs A03.
