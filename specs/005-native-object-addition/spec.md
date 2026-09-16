# Feature Specification: Real addition of extra objects

**Feature Branch**: `main` (folder independent from the branch)
**Created**: 2026-09-16
**Status**: Implemented and validated: nine exact sources, eight additions and direct tutorial entry. The editor path, the patch and Dolphin all PASS; the other levels remain to be studied. See validation.md.

**Extension requested on 2026-09-16**: aim for eight additions per patch, widen the confirmed sources and launch the level directly to speed up editing. A direct entry must load the bytes of the current patch, including after the additions have been modified; an old restored scene is not evidence. The first protocol targets the tutorial; the other levels then require their own strategy and their own evidence. The interface keeps a plain launch and states explicitly which levels are supported. The published limits stay the ones actually validated.
**Input**: Drag an object from the Project pane into the Scene, as in Unity, to create an extra instance in front of the camera. Explicit choice: "real addition in the game", not a copy that only exists in the editor.

## User Scenarios & Testing

### User Story 1 — Add without sacrificing (Priority: P1)

The user drops a decoration of the current level into the scene, then finds it in game in addition to the objects that were already there.

**Why this priority**: The current replacement does not satisfy the need to add.
**Independent Test**: Drop a sunflower near the tutorial's start; save, patch and boot twice. The copy and the two original sunflowers must coexist, with the weed and the other objects unchanged.

**Acceptance Scenarios**:
1. **Given** a supported object, **When** it is dropped on a visible surface, **Then** a distinct instance appears at the chosen point, with the source staying in place.
2. **Given** a recorded addition, **When** the level starts, **Then** the extra instance is visible at the destination and no existing instance has been replaced.
3. **Given** an unsupported category, **When** the user attempts an addition, **Then** the reason appears in English with no silent modification.

### User Story 2 — Modify and undo the addition (Priority: P2)

The added instance can be selected and moved; Undo, Redo and Reset scene restore the expected states.

**Independent Test**: Add, move, undo twice and redo twice; the recorded result matches the displayed state exactly. Reset scene returns to the opened level.

### Edge Cases

- Drop outside the scene, Escape, unavailable source: nothing is created.
- No surface under the pointer: an explicit placement plane; no invalid coordinates.
- Reopening, a patch change or a new level: no copy coming from an old memory state.
- Scripted or inactive source, or one without confirmed geometry: an explicit refusal as long as that category is not validated.
- Instance limit or a failed load: an understandable refusal, no automatic sacrifice.

## Requirements

### Functional Requirements

- **FR-001**: An addition increases the number of targeted instances in the playable scene by one, with no replacement.
- **FR-002**: The drop preserves the source, its appearance and its properties; the destination matches the point chosen in the scene.
- **FR-003**: Recorded additions survive the save → patch → cold boot path.
- **FR-004**: Added instances have a distinct identity, a selection and a reversible history.
- **FR-005**: No unvalidated category is presented as addable to the game; no editor-only copy stands in for a result.
- **FR-006**: The original data, the open session and the user's own Dolphin are preserved.
- **FR-007**: The interface texts stay in English and the folders work from the keyboard with no controls nested inside their titles.
- **FR-008**: The evidence identifies the expected result, the patch actually consumed and the preservation of the witness objects across two identical boots.

### Key Entities

- **Source**: an existing object of the level whose creation is validated for the game concerned.
- **Addition**: a new identity, source, destination, orientation and scale; independent of any victim.
- **Evidence**: entry, patch, observations of the result and preserved witnesses.

## Success Criteria

- **SC-001**: A drop produces an extra instance visible in game on 2/2 identical boots.
- **SC-002**: Both source/witness objects and the initial weed stay present; no object sacrificed.
- **SC-003**: Undo/Redo/Reset reproduce the expected states exactly, including after a copy has been moved.
- **SC-004**: Folders can be selected and collapsed with Space and Enter, with no nested-interactive-control warning.

## Assumptions

## Extension requested on 2026-09-16: diagnostics and reusable runs

The user asks to widen the scope to the `1_Coper` coins, barrels and Chompies, and to know why an object can or cannot be added, without depending on a full manual review of each object.

- **FR-009**: analyse every object in one pass and show a compatibility family, the checks that pass and the concrete obstacles. A script being present does not automatically mean incompatible.
- **FR-010**: separate Confirmed, Needs test, Needs script test, Runtime passed / visual pending and Blocked. Candidate states are not promises of a successful addition.
- **FR-011**: offer a batch test that picks family representatives, performs the boots, checks the native instances, keeps captures/failures and reuses the results for the same assets/recipes. No promotion from a name resemblance or from a single boot.
- **FR-012**: identify the results of testing the three requested families explicitly. Visibility and behaviour (collection, destruction, combat) stay separate dimensions; a successful allocation does not allow gameplay to be declared validated.
- **FR-013**: allow eight confirmed additions per patch, show the remaining capacity and refuse the ninth with no mutation. History, save and patch cover all eight instances.
- **FR-014**: offer a direct entry and a direct test of the tutorial after an automatic preparation; load the archives and the additions of the current patch. Refuse incompatible states and the other levels, with no silent fallback.
- **FR-015**: allow keeping or skipping the first cinematic during automated tutorial launches. An English option, remembered, disabled by default; the preparation and the patch stay identical. In manual plain game the player keeps the controls. The skip must use the game's own mechanism and preserve the additions and control of the character.

Acceptance: searching `Barrel`, `1_Coper`, `Chompy` → an explicit diagnostic; a reproducible campaign that does not modify the user's scene; results persisted with digests and readable from the editor. Extend Add only where the evidence allows it.

Next priority: explain and fix the difference between moving an existing enemy/loot and adding a copy of it. Test separately the hypotheses of shared parameters, identity, activation context and disappearance tied to how the macro unfolds. A solution must keep the original script, produce a distinct instance visible over two identical boots, and preserve the originals. Sharing a script is not considered faulty without evidence.

- First scope: static decoration already available in the tutorial; cross-level import, new geometry and new collisions are out of scope.
- Confirmed scope of the additions: SSPP52 Rev1, tutorial, nine exact sources listed in compatibility.md, at most eight additions in total per boot, position/orientation, original scale 100 %. Scripts and activation distances are preserved; a visible creation does not guarantee survival during the macro. The other models and parameters remain to be validated.
- The existing gates allow a confirmed replacement, not an arbitrary insertion. The experiments run in dedicated local profiles.
