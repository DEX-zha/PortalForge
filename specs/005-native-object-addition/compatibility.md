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

Scripted creation waits for both the tutorial readiness anchor and a populated native activation-observer list. The factory runs from the activation update, with source class, parent, model and exact script checks. Source IDs, scripts, activation distances and parameters are preserved; copies have independent actors and actor parameters. No IGZ insertion or removal of behavior is used. Later disappearance is recorded separately from successful creation; static additions must still pass the final live-instance check.

The automated verifier checks the requested **initial** transform separately from the current transform changed by AI or animation. Family reports use version `native-family-v2-observer-ready`; an earlier failure from the premature creation recipe does not stand in for a new test.

## Validated sources

| Exact Project source | Source offset | Retained behavior |
|---|---|---|
| Sunflower | 3446244 | No placement script |
| Barrel | 3983352 | Barrel.ai |
| Enemy_ChompyNipper | 2390540 | Enemy_Chompy.ai |
| 1_Coper(1) | 3034548 | Placed_Loot_Spinning.ai |
| Enemy_ChompyNipper(1) | 2347820 | Enemy_Chompy.ai |
| Enemy_ChompyClamper | 2357236 | Enemy_Chompy.ai |
| 1_Coper(2) | 3040688 | Placed_Loot_Spinning.ai |
| sunflower_Template(2) | 3451516 | No placement script |
| weed_2_Template(8) | 3452000 | No placement script |

Use **Can add** to find these nine sources. The limit is eight added objects per patch, shown as `0/8 added` in Project, with original 100% scale, tutorial SSPP52 Rev1 and an editor-owned Dolphin launch. The ninth addition is refused without changing the scene. Regenerate existing scripted-addition patches after updating the editor. Eight mixed additions passed two identical cold boots; the five new exact sources are covered by `level.prop.native-addition-expanded`.

## Remaining research

- Early Chompy/coin loss was traced to native distance deactivation before normal activation readiness. The deferred recipe produces visible additional actors on two identical cold boots; this confirms creation and rendering, not full combat or collection semantics.
- Native behavior and activation distances still govern a copy after creation. A Chompy may move or be removed, and a distant clone may deactivate. Persistence outside activation range is not guaranteed.
- Other source parameters, scale changes, inter-level imports and level reload inside the same emulation remain outside the confirmed scope. M4A/M4B/M5 are unchanged.
