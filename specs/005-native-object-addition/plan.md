# Implementation Plan: Real object addition

**Branch**: main (folder 005, independent) | **Date**: 2026-09-16 | **Spec**: [spec.md](spec.md)

## Summary

Create an extra native instance with no victim. Research the engine's cloning before exposing Add in the editor. The confirmed replacement of 004 stays separate; no purely visual copy satisfies US1.

## Technical Context

- Node.js 24, ES modules, Three.js and the existing editor; Felk's embedded Python for runtime observations.
- Windows platform, SSA Wii SSPP52 Rev1, dedicated Dolphin profile under .local/.
- Storage: reports and captures in .local/; specs and findings in Git with no protected data.
- Tests: node --test, Edge browser through CDP, RAM observation + rendering over two identical boots.
- Scope: a decoration already loaded in the tutorial, then the identity and the history of the additions.
- Performance: no active tracing instrument in the user's path; bounded instrumentation for research.
- Engine unknowns: the native creation call, context/arguments/ownership and persistence through a patch. These are research tasks, not unspecified user decisions.

## Constitution Check

M0..M3 PASS verified; M4A/M4B/M5 UNKNOWN. Research and observation allowed. No writer for new geometry/collision. No IGZ insertion and no hijacked victim presented as an addition. No UNKNOWN property declared editable. Any engine patch requires its own evidence and its own report before integration. The game sources and the user's own Dolphin stay intact. The runs go through the MCP and the .local/ profiles.

## Phase 0 — Research

1. Keep the 004 accessibility fix and its keyboard evidence.
2. Audit the old failures and inventory the clone opcodes of the existing scripts.
3. Identify the native handler in MEM1, its parameters and an observable control call; delegated read-only to native_clone_research.
4. Observe native creation in Dolphin with no level edit; derive a minimal reversible experiment, check the assets and the lifecycle.
5. Demonstrate an extra instance with the source and the witnesses preserved. Prove persistence over two identical boots before declaring the recipe CONFIRMED.

## Phase 1 — Conditional contract

See data-model.md and contracts/addition.md. The contract describes the required result, but no addition endpoint is enabled before the evidence. Reuse the existing transaction/history system once the persistent representation is known.

## Project Structure

- specs/005-native-object-addition/: spec, plan, research, model, contract, quickstart, tasks.
- tools/ssa-archive/research-probes/: cloning and inspection probes, with no game data.
- .local/object-workflow/: the existing audit; .local/native-addition/: isolated analyses and runs.
- tools/ssa-archive/src/editor/ and src/view/: integration only after runtime evidence.
- docs/findings/records/: findings with their confidence and exact evidence.

## Complexity Tracking

T028–T030: a native command to skip the cinematic after the tutorial has loaded, with the `skip_intro` option passed from the browser to the launcher. Without the option, the existing macro is kept. The option is available for test/direct-test/direct-play of the tutorial, disabled in manual plain game and on the other levels. Local preference remembered; no new in-level state and no modification of the archive's scripts.

Extension T023–T027: resuming before the transition, built with the same Riivolution virtual disc and no native codes. The control prepared on the original WBFS failed: its file table differs. Tie the cache to the disc layout and check the FST table before/after restoring. Load the figure before the state, reconnect the Wiimote, then trigger the transition. Check that Dolphin re-reads the level through the current descriptor and installs the current codes after restoring. State/runtime/game/configuration/figure digests and the target are mandatory; restoring an already loaded scene stays excluded. Eight mixed additions use 2 344 of the 3 256 Gecko bytes; widen the sources only through explicit evidence. The exploratory helpers and states stay in .local/. No implicit progress on the gates.

Diagnostics extension: classify read-only by model, script and context; results indexed by the digest of the assets and by the recipe version. A dedicated campaign uses session copies, picks one representative per family and produces a result per candidate, failures included. The native test of scripted sources preserves their scripts; no new behaviour is invented and no missing visual check is hidden. Automated technical checks never become a confirmation of rendering/gameplay on their own.

Constitution 1.1.0: the Riivolution patch keeps the archive replacements; a temporary Gecko companion carries the confirmed native recipe, with no IGZ insertion. Reason: creation requires the native factory and cannot be represented by simply appending a record. Finding `level.prop.native-addition`, two identical boots, a bounded context and the profile restored. No progress on M4A/M4B/M5.

Enemies/loot priority: compare the instances that already share a script/ID; separate their own parameters, execution variables and legitimately shared references. Controls at fixed positions away from the player's arrival, then a bounded copy of the state on the factory's return into the reserved Gecko memory. No GDB and no per-frame trace. Change one causal condition at a time, document the failures and confirm a recipe before enabling it in Project.
