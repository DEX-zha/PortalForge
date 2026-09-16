# Add compatibility and reusable tests

Project now reports compatibility for every object. The Inspector explains the checks and links to the latest local report and capture timeline. All interface text is English.

| Project label | Meaning |
|---|---|
| Add | This exact source has a CONFIRMED editable native recipe. |
| Needs test | Visible model and supported runtime layout; creation and rendering untested. |
| Needs script test | Same structural eligibility, with a retained script whose lifecycle needs observation. |
| Visual check pending | Native placement and actor passed the automated checks; this alone does not enable Add. |
| Lifecycle check needed | No matching live actor remains at the final checkpoint; it may have appeared earlier. |
| Related source tested | Same model/script family, but a different placement was tested. Its parameters may differ. |
| Test failed | The run did not establish native creation. Read the reason; this is not a declaration of universal incompatibility. |
| Blocked | A prerequisite is absent: runtime map, visible model, original identity or supported scale. |

## Workflow

1. Open the original tutorial with its runtime map. Search for an object and select it.
2. Read **Add compatibility** in the Inspector. **Can add** filters confirmed sources.
3. **Test selected** runs two cold boots for the selected source. **Test next 2 types** selects up to two untested model/script families from the current Project search/folder/filter.
4. Progress and **Stop test** stay available. The scene is locked for the test; its bytes, additions and history are preserved. The dedicated Dolphin is stopped and its temporary profile restored afterward.
5. Open the report from the Inspector. Review the tutorial capture timeline alongside native observations. Technical creation, rendering and gameplay are separate results.

A batch takes about nine minutes for two tutorial boots. It uses the original tutorial, not the edited scene. The initial probe positions are `[90,10.5,48]` and `[88,10.5,43]`; these are test destinations, not guarantees for arbitrary gameplay situations.

Families use the decoded-level fingerprint, archive, model resource, script resource and scale. A family result avoids redundant initial investigation, but does not certify all placements sharing those resources. The current tutorial has 234 structurally testable families, including scripted objects. Reports and captures stay under `.local/addition-validation/` and `.local/dolphin-evidence/`.

## Extending a confirmed recipe

`native-recipes.json` associates an exact source/model/script with a finding. Only a CONFIRMED editable finding enables the source. A successful boot, non-null allocation or related model name never does. Promotion still requires reproducible memory evidence and visual review; destruction, collection and combat need separate gameplay evidence.

Scripted creation waits for the independently confirmed tutorial readiness anchor and checks the source class, parent, model and exact script. It retains the script. No IGZ insertion or removal of behavior is used. Later disappearance is recorded separately from successful creation; static additions must still pass the final live-instance check.

## Remaining research

- `1_Coper(1)` (`Placed_Loot_Spinning.ai`): factory return observed, final matching actor absent; reason unresolved.
- `Enemy_ChompyNipper` (`Enemy_Chompy.ai`): same lifetime uncertainty in two identical runs. No claim of validated combat or collection.
- Test earlier checkpoints and alternate destinations before concluding that these families cannot be added. The reusable runner now records intermediate tutorial checkpoints for this purpose.
- Other source parameters, scale changes, inter-level imports and level reload inside the same emulation remain outside the confirmed scope. M4A/M4B/M5 are unchanged.
