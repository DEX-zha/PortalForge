# Editor next steps

Initial request 2026-09-15: three batches documented, the first one to implement. Extension of 2026-09-16: eight additions and direct tutorial entry requested and validated; import and the other levels stay in the backlog.
[Spec](../../specs/004-object-workflow/spec.md) · [Plan](../../specs/004-object-workflow/plan.md) · [Tasks](../../specs/004-object-workflow/tasks.md) · [Research](../../specs/004-object-workflow/research.md)

| Step | Result | Limit / evidence |
|---|---|---|
| 1 — Browser and drag and drop | Delivered: categories, thumbnails, drop, history, eight additions | Nine exact sources confirmed, SSPP52 Rev1 tutorial, scale100; no victim needed for Add |
| 2 — Objects from other levels | External catalogue, diagnostics then import | Local reuse is distinct from a real import; new assets M4A, collision M4B, behaviours M5 |
| 3 — Direct level access | Delivered for the tutorial, other levels to study | Preparation before loading onto a compatible virtual disc; cache tied to assets/layout, current patch re-read after resuming |

Work and validation state live in the tasks. M0–M3 PASS; M4A/M4B/M5 UNKNOWN. Data, saves and captures stay local.

Current state: eight native additions at most, nine sources in **Can add**, among them Nipper, Clamper, coins, Barrel and vegetation. Two identical boots of the batch of eight, 280 SSA tests and 6 MCP tests pass. Direct tutorial entry re-reads the current modifications after a checkpoint taken before loading, with test/game modes. [Scope and evidence](../../specs/005-native-object-addition/validation.md) · [Usage](../../specs/005-native-object-addition/quickstart.md) · [Launch guide](direct-entry.md) · [Per-level matrix](../level-entry-status.json).

History, batch 1 delivered on 2026-09-15: the tutorial's 673 placements reachable, drop with preview and confirmation, stale plans refused, undo/redo and shared geometry kept up to date. Validation: 246 SSA tests + 6 MCP tests, WebGL browser run, two identical boots with file consumption and a visual result. [Report](../../specs/004-object-workflow/validation.md). Batches 2 and 3 were documented only at that point.

Interface improved afterwards: a Unity-inspired organisation with Hierarchy / Scene / Inspector, a resizable Project pane at the bottom, categories and sub-categories, names above real 3D thumbnails, search and adjustable card size. [Interface specs, tasks and validation](../../specs/004-object-workflow/interface.md): 248 SSA tests and a full WebGL scenario, including a 1280×800 layout.

Extension of 2026-09-16: Barrel, Enemy_ChompyNipper and 1_Coper(1) added to the confirmed native sources, alongside the sunflower. Scripted creation now waits for the activation system; early copies were disabled before the tutorial. Project shows the diagnostics and offers automatic per-family tests (234 testable families), with intermediate captures and persistent results. Validation: two identical Chompy/coin boots, 271 SSA tests and 6 MCP tests. Scripts, IDs, distances and clean states are preserved; visible creation stays distinct from gameplay and from final survival. [Diagnostics and campaigns guide](../../specs/005-native-object-addition/compatibility.md).
