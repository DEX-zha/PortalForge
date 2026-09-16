# Feature Specification: Object browser, import and direct level access

**Feature Branch**: `main` (folder independent from the branch)

**Created**: 2026-09-15

**Status**: Batch 1 implemented and validated on 2026-09-15; batches 2–3 documented and planned, still to be done. See [validation](validation.md).

**Interface evolution**: Unity-inspired layout, folders/sub-folders and 3D thumbnails under the names, implemented as described in [interface.md](interface.md).

**Requested and implemented additions**: press-and-hold drag from the Project pane into the scene with a preview following the pointer; a **Reset scene** button with confirmation, an exact return to the opened file and Redo preserved; interface entirely in English, game data names unchanged. Detailed specification and validation: UI06–UI09 in [interface.md](interface.md).

**Input** (translated from the user's original French): "1: add a browser with the objects, where we can drag and drop into the scene
2: be able to import objects from another level into another scene 3: be able to load any level directly
without going through the menus etc (document everything, always fill in the specs and note the steps)".
Clarification: "Document the three steps and implement the first batch".

## User Scenarios & Testing

### User Story 1 — Browse and drop an object from the level (Priority: P1)

The user finds an object by its name, its model or its layer, selects it to locate it in
the scene, then drags it into the scene to prepare a copy at the chosen position. The addition available
today replaces an existing object: its identity and any effects on other objects are
shown before confirmation. A cancelled drop changes nothing.

**Why this priority**: This interaction makes the duplication that already exists usable without typing offsets.

**Independent Test**: In the tutorial, search for a plant, drop it on the ground, choose a compatible object
to replace, check the preview and the summary, confirm, undo, redo, save and observe two in-game runs.

**Acceptance Scenarios**:

1. **Given** an open level, **When** the user filters by name, model or layer, **Then** the list and its
   counter match the level's placements, including the identified hidden objects and assets.
2. **Given** a result, **When** the user selects it, **Then** the inspector shows that object and the view
   frames it by making its layer visible; no object is modified.
3. **Given** a duplicable source, **When** it is dragged onto a visible surface, **Then** a preview shows
   the proposed position; no object is replaced until the choice and the confirmation are made.
4. **Given** a prepared drop, **When** the user picks a compatible target, **Then** the summary names the deleted
   target and the other affected objects. Critical consequences require an explicit agreement.
5. **Given** an accepted summary, **When** the user confirms, **Then** a single operation replaces the target,
   the source stays in place, and the display and the inspector match the data that can be saved.
6. **Given** a confirmed copy, **When** the user undoes then redoes, **Then** the displayed data and models
   return exactly to their previous state and then to their modified state.
7. **Given** an unsupported source, no compatible slot, a drop outside the scene, or a session
   busy with Dolphin, **When** a drop is attempted, **Then** the reason is visible and no modification is made.

### User Story 2 — Import from another level (Priority: P2)

The user picks an object from a source level and knows its compatibility with the target level before importing.
A real import includes the assets the object needs; a mere match with an object already present
in the target is presented as a local reuse, never as a successful import.

**Why this priority**: Reusing the game's catalogue widens what can be created once the drop is stable.

**Independent Test**: Choose a source object absent from the target, import its assets without altering the source level,
then observe it rendered in two identical launches of the target level. Behaviours and collisions stay
separate capabilities and are not assumed from the rendering.

**Acceptance Scenarios**:

1. **Given** two indexed levels, **When** a source object is chosen, **Then** the diagnostic distinguishes assets that are
   present, absent and not understood, with a reason for every unavailable import.
2. **Given** a local match, **When** it is chosen, **Then** the result announces a reuse of the
   target model and keeps its limitations; no foreign data is injected silently.
3. **Given** a verified import recipe, **When** the import is confirmed, **Then** the object is visible in the target
   level, all the dependencies it needs are resolved, and the sources stay unchanged.
4. **Given** an unknown dependency, **When** the user attempts the import, **Then** writing is unavailable and
   the diagnostic stays readable. Unsupported cases are not hidden from the catalogue.

### User Story 3 — Start the chosen level directly (Priority: P3)

The user picks the level being edited and lands in a playable scene with no action in the menus. The intended target
stays every playable level of the game. Validated levels and those with no method yet are distinguished.

**Why this priority**: Shorten the wait between editing and observing, without making the latest modifications invisible.

**Independent Test**: On the tutorial then on another chapter, launch the chosen level with no action in the menus,
observe a modification specific to the current patch, and start over after a new patch.

**Acceptance Scenarios**:

1. **Given** a level whose direct start has been verified, **When** it is launched, **Then** the playable scene
   matches that level and the current version of the patch, with no menu handling.
2. **Given** a new modification, **When** the start uses an earlier incompatible state, **Then** that
   state is rejected or rebuilt; the old data does not silently replace the modification.
3. **Given** a level that is not validated yet, **When** it is chosen, **Then** its unavailability and the existing
   fallback method are announced; the tutorial does not start under the label of another chapter.

### Edge Cases

- Identical names, inactive asset, object without a model, context-dependent script, shared model.
- Level with no validated pointer map, object with no compatible slot, target that changed after preparation.
- Drop into the sky: an explicit horizontal plane at an adjustable height, without claiming to detect a game collision.
- Hidden layers, wireframe scenery, resizing, hovering over the interface, abandoning the drag and drop, the Escape key.
- Undoing a replacement that changes a shared model: rebuild every visually affected object.
- Source/target file modified during an import, cyclic dependencies, type index that differs between levels.
- Quick state coming from another patch, another game version or another Dolphin; level not visited yet.

## Requirements

### Functional Requirements

- **FR-001**: The browser must list every placement of the current level with name, model, layers and drop availability.
- **FR-002**: The search must filter case-insensitively and offer the categories all, duplicable,
  scripted, and disabled assets/objects, with an explicit counter and empty state.
- **FR-003**: Selecting a result must locate and frame the placement without modifying the data.
- **FR-004**: The drop must propose a position on a visible surface or on an adjustable horizontal plane and
  show a temporary preview that is distinct from the recorded objects.
- **FR-005**: Batch 1 must reuse a compatible existing slot. The user must choose and confirm
  the replaced object; no target is sacrificed automatically.
- **FR-006**: The summary must show every known consequence, block invalid operations and require
  the prescribed agreement for critical consequences. A stale preparation must be refused.
- **FR-007**: A confirmed copy must be a single undoable operation; abandoning, an error and a refusal must preserve
  the data, the history and the last save.
- **FR-008**: The source must not be moved by the drop. A scripted, inactive or non-visible source that is not
  supported must stay readable with an explanation; this batch activates no new behaviour.
- **FR-009**: The display must be rebuilt after a replacement, an undo and a redo to reflect the current models,
  shared assets, selection, layers and availabilities.
- **FR-010**: The drop commands must be unavailable during a Dolphin launch or another operation in progress.
- **FR-011**: The future multi-level catalogue must identify level and source object unambiguously; no arbitrary path
  supplied by drag and drop may cause a read or a write outside the configured sources.
- **FR-012**: The future import must inventory the dependencies, distinguish local reuse from a real transfer, and
  write only through a recipe proven for the dependencies involved.
- **FR-013**: The future direct start must check the level identity, the version of the patch consumed and the playable scene;
  a loading screen or a successful connection is not a validation.
- **FR-014**: Quick states must be tied to their exact inputs and must never be used to demonstrate the loading
  of a new patch whose data is already resident in the old state.
- **FR-015**: Each batch must document decisions, limits, tests, experiments and the tasks actually finished. Game data
  and visual evidence stay local; the WBFS and the user's own Dolphin are preserved.

### Key Entities

- **Catalogue object**: a placement identified in a level, with name, representation, origin and available capabilities.
- **Prepared drop**: source, proposed position, chosen target, consequences and version of the analysed data.
- **Import diagnostic**: source/target object, dependencies and compatibility verdicts with their evidence.
- **Level start profile**: target, validated method, exact inputs, evidence and limitations.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In the tutorial, 100 % of the placements are reachable in the browser; searching for a known name
  and selecting it takes under 30 seconds, and the filter answers in under 300 ms on the reference machine.
- **SC-002**: Drop, abandon, confirmation, undo and redo pass the end-to-end scenarios; no
  data changes before confirmation and a copy produces exactly one history operation.
- **SC-003**: Two launches of the same patch show the expected copy at the chosen position, with the replacement consumed
  and a playable scene; the other known differences match the accepted summary.
- **SC-004**: A real import is only announced as available once an object absent from the target has been rendered in two identical runs,
  with no required dependency left unknown; collision and behaviour have their own status.
- **SC-005**: Direct start is only announced for a level after two playable arrivals with no menu action, where
  the method also demonstrates the use of a modified patch; at least two chapters are required before generalising.
- **SC-006**: Every task carries a verifiable state; no research task is marked as a delivered capability.

## Assumptions

- The first batch uses the objects of the open level, with the duplication recipes already validated; adding without
  replacing stays a separate goal, not disguised by the interface.
- Batches 2 and 3 were initially documented only. The extension of 2026-09-16 delivers direct tutorial entry (005, T023–T027);
  import and the other levels stay explicit research steps. Generalisation SC-005 still requires at least two validated chapters.
- Drag and drop targets the mouse on Windows; selecting from the catalogue and preparing a drop do not start the game.
- The proposed initial pose keeps the source's heading and scale; graphical ground is not proof of collision.
- The catalogue implies neither script simulation nor support for the assets that are currently hidden.
