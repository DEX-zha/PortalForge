# Specification status

Reviewed against the code and recorded evidence on 2026-09-17, on `feat/007-unlimited-additions`.
The numbered folders retain their original designs and experiments. An unchecked task is not a delivered
capability; an old acceptance limit is not the current editor limit when a later feature explicitly supersedes it.

| Feature | Delivered and evidenced | Remaining or superseded |
|---|---|---|
| [001 — Level research](001-ssa-level-research/spec.md) | Archive tooling and the M0–M2 research workflow; all listed implementation tasks checked | The wider feasibility goal still requires M4A, M4B and M5. M3 was delivered by 002. The constitution is now ratified at 1.2.0. |
| [002 — Object model](002-igz-entity-model/spec.md) | IGZ readers, placement contract, structural class detection and M3 same-size replacement | Hugo/field research, negative-result indexing, full quickstart replay and finding annotations in `igz show` remain open in [tasks](002-igz-entity-model/tasks.md). Insertion experiments are evidence, not a supported editing recipe. |
| [003 — 3D editor](003-placement-editor-3d/spec.md) | Session, undo/redo, safety, save/patch/launch and tutorial proofs; Mining edit proof delivered by 006 | T053/T054 are closed with the two existing Mining runs. Lock-during-play observation, the complete performance/regression protocol and remaining documentation tasks stay tracked in [tasks](003-placement-editor-3d/tasks.md). |
| [004 — Object workflow](004-object-workflow/spec.md) | Project browser, replacement workflow, drag/drop and reset; read-only external catalogue delivered by 007 P | Dependency closure and import remain research (007 C). Direct entry was extended by 005/006; further per-level evidence remains open. |
| [005 — Native addition](005-native-object-addition/spec.md) | Nine exact tutorial sources, at most eight additions, scale 100, direct tutorial checkpoint entry; [confirmed scope](005-native-object-addition/compatibility.md) | The old refusal of a ninth or unconfirmed source is superseded by 007. The original confirmed scope is unchanged; family reports do not confirm other sources. |
| [006 — Multiple levels](006-multi-level-editing/spec.md) | 76 archive entries, 75 scenes with placements; level switching, Mining transform and redirect proofs; scene snapshots | Title has no placement class. Other levels require their own transform/entry proof. 007 supersedes tutorial-only additions; the individual automatic source test remains tutorial-only. |
| [007 — Extended additions](007-unlimited-additions/spec.md) | A, S01–S06b, S08, P and C06: experimental resident additions, live measurement/refill, 152 creations on two Mining boots, 256 KB reservation experiment, 8 800 kinds across 75 scenes, per-file script diagnostics | S07/V03/V04 coverage, S09 memory table, B activation edits, C import, and T002–T010 integration/proof gaps remain in [tasks](007-unlimited-additions/tasks.md). C01 is delivered by P; V02's family-promotion proposal is superseded, not accepted. |

## Current rules

- M0–M3 are PASS. M4A (assets/geometry), M4B (collision) and M5 (gameplay) remain UNKNOWN.
- Confirmed file properties may be edited in place. Experimental native additions are separately allowed by
  constitution 1.2.0 and inspected at launch; they never authorize IGZ insertion or import.
- Transform evidence and level-entry evidence are independent. Mining is the only non-tutorial level explicitly
  covered by `level.transform.other-levels.confirmed_levels`; landing in another level cannot promote its edits.
- 8 is the confirmed mixed-addition count, 18 the slot-layout capacity, 59 one compact table's capacity,
  152 the measured refill experiment and 590 the editor guard. These numbers answer different questions.
- Runtime reports distinguish creation from later survival. Neither a family verdict nor a successful boot
  establishes full combat, collection, visibility or persistence outside the observed scope.
- Whole game cards for foreign kinds are read-only. Reserving MEM2 is a separate runtime experiment, not M4A
  asset-import evidence; no addition table uses the reservation yet.

Current API extensions: [003 editor](003-placement-editor-3d/contracts/editor-api.md),
[004 workflow](004-object-workflow/contracts/editor-workflow.md),
[005 confirmed addition baseline](005-native-object-addition/contracts/addition.md),
[006 levels](006-multi-level-editing/contracts/levels-api.md),
[007 additions and library](007-unlimited-additions/contracts/additions-api.md).

The [documentation audit](../docs/reports/documentation-audit.md) records corrections and verification.
