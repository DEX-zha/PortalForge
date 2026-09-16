# Feature Specification: 3D placement editor

**Feature Branch**: `003-placement-editor-3d`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description (translated from French): "Build the simple 3D view: cubes/proxies only, grouped by layer, mouse selection, free camera, Move / Rotate / Scale gizmos. Wire the v1 contract straight into the UI: position, rotation, scale, model, behavior, layers, shared state, evidence, safety. Respect the safety rules in the editor: critical issues clearly reported, scripted objects with a warning, duplication/replacement only when the plan is valid. Implement Save → validation → patch → Launch Dolphin. Validate the editor on the tutorial, then on at least a second level actually booted. Only after that: more advanced scripts/gameplay, geometry, collisions and duplication without sacrifice."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See a level and inspect what an object really is (Priority: P1)

A researcher opens a decoded level file and sees every placement of that level as a simple box in a 3D view,
positioned where the game puts it, grouped by the layer it belongs to. They fly the camera freely, click a box,
and read everything the project knows about that object: its name, position, heading, scale, which model file it
shows, which behaviour script it runs, which layers claim it, how many other objects share its model record, and
for each of those facts, whether it is backed by runtime evidence or only by the file structure.

**Why this priority**: this is the whole value of the work done so far, made legible. A level is currently a list
of hexadecimal offsets; seeing it in space is what turns it into something a person can reason about. It is also
the only slice that carries no risk at all, because it writes nothing.

**Independent Test**: open the tutorial level, confirm the boxes form a recognisable island, confirm the layer
list matches the one the project's existing level report states for that file, click a known object such as the
windmill blades and confirm the inspector shows the same values that report states for it.

**Acceptance Scenarios**:

1. **Given** a decoded level file, **When** the researcher opens it, **Then** every placement the resolver finds
   appears as a box at its recorded position, and the number of boxes equals the number of placements reported for
   that file.
2. **Given** the level is displayed, **When** the researcher hides a layer, **Then** only the objects claimed by
   that layer disappear, and objects claimed by several layers remain visible while any of their layers is shown.
3. **Given** an object is selected, **When** the researcher reads the inspector, **Then** it shows position,
   heading, scale, model path, behaviour script, layers and shared-model usage count, each accompanied by the
   evidence that produced it.
4. **Given** an object whose model cannot be resolved, **When** it is selected, **Then** the inspector states that
   it is a marker rather than a visible prop, and the object is drawn differently from objects that have a model.

---

### User Story 2 - Move an object and see it move in the game (Priority: P2)

The researcher selects a box, drags a move gizmo, adjusts the heading and the scale, saves, and the editor
validates the change, builds a patch and launches the game so the researcher can look at the result. Nothing
reaches the game unless the validation passes.

**Why this priority**: this closes the loop that makes the tool an editor rather than a viewer. It reuses the
transform edit that is already demonstrated in game, so the risk is in the interface, not in the format.

**Independent Test**: move one plant of the tutorial by a visible distance, save, let the editor produce the
patch, launch, and compare the screenshot with the unmodified run at the same point.

**Acceptance Scenarios**:

1. **Given** an object is selected, **When** the researcher drags the move gizmo, **Then** the box follows the
   pointer along the dragged axis and the inspector position updates continuously.
2. **Given** an object has been moved, **When** the researcher saves, **Then** the produced level file differs
   from the original only in the transform fields of that object, and the file length is unchanged.
3. **Given** a save has been validated, **When** the researcher asks to launch, **Then** the game starts from a
   patch workspace that replaces only the edited archive, leaving the original disc image untouched.
4. **Given** a validation failure, **When** the researcher asks to launch, **Then** the launch is refused and the
   reason is shown; no patch is produced.
5. **Given** an object whose evidence for an attribute is weaker than structural, **When** the researcher tries to
   edit that attribute, **Then** the editor refuses and explains which evidence is missing.

---

### User Story 3 - Duplicate an object without breaking the level (Priority: P3)

The researcher picks an object to copy and a sacrificable object of the same size to copy it over, and the editor
shows what the operation will change beyond the slot itself: which shared records are rewritten, how many other
objects use them, whether either object runs a behaviour script. The operation is offered only when the resulting
plan is valid, and every critical consequence is displayed before the researcher can confirm.

**Why this priority**: duplication is demonstrated in game but it consumes a slot and can silently retexture other
objects. It is worth having in the editor, and it is exactly the operation that must never happen by accident.

**Independent Test**: duplicate a plant over another plant of the same size in the tutorial, confirm the editor
lists the shared model record and its user count before confirming, save, launch, and see the duplicate in game.

**Acceptance Scenarios**:

1. **Given** a source object is selected, **When** the researcher asks to duplicate it, **Then** the editor offers
   only the objects whose slot size matches the source, and states how many candidates exist.
2. **Given** a source and a target slot are chosen, **When** the editor prepares the operation, **Then** it lists
   every safety rule that the operation triggers, with its severity and the evidence behind it, before any
   confirmation is possible.
3. **Given** an operation that triggers a blocking rule, **When** the researcher tries to confirm, **Then** the
   confirmation is refused and the blocking reason is shown.
4. **Given** an operation that triggers a critical rule, **When** the researcher confirms, **Then** the
   confirmation requires an explicit second acknowledgement naming the consequence.
5. **Given** a duplication has been saved, **When** the produced file is compared with the original, **Then** the
   only changed bytes are inside the sacrificed slot and the reference counts the plan declares.

---

### User Story 4 - Trust the editor on more than one level (Priority: P4)

The researcher repeats the edit loop on a second level that has never been used during development, and the change
is observed in the running game. The result of each attempt is recorded as an experiment with its inputs, its
prediction and what was actually seen.

**Why this priority**: the placement model is validated across five files on paper but proven in game on one
level only. Until a second level is edited and booted, the editor is a tutorial-specific tool.

**Independent Test**: open a second level, move one object with a resolved model, save, launch, and judge the
result against the prediction recorded before the boot.

**Acceptance Scenarios**:

1. **Given** a level the editor has never opened, **When** the researcher opens it, **Then** the placements are
   found without any per-level configuration.
2. **Given** an edit on that level, **When** it is saved and launched, **Then** the level loads and the predicted
   visible change is observed, or the failure is recorded with what was seen instead.
3. **Given** an edit has been judged, **When** the researcher looks for it later, **Then** the experiment record
   contains the file hashes, the prediction, the observation and the outcome.

---

### Edge Cases

- A level file in which no placement class can be detected: the editor states that the file carries no placements
  rather than showing an empty view that looks like a loading failure.
- An object whose model reference is ambiguous: it is drawn and selectable, the inspector lists every candidate,
  and the object is excluded from operations that depend on knowing the model.
- Two objects at the same position, or a box entirely inside another: selection must let the researcher reach both,
  and the inspector must make clear which one is selected.
- An object placed far outside the playable area: the camera must be able to reach it, and framing the whole level
  must not make near objects unusably small.
- An edit that is saved while the game is already running from a previous patch: the editor must not silently
  replace files a running session is reading.
- A save that would change bytes outside the edited object: it is refused, and the unexpected change is reported.
- A level that has no runtime evidence map: every attribute derived from pointers is shown as structural, and the
  editor says so rather than presenting structural values as proven.
- An edit that produces a valid file but freezes the game: the outcome is recorded against the edit, so the same
  operation is not presented as safe afterwards.

## Requirements *(mandatory)*

### Functional Requirements

**Viewing and selection**

- **FR-001**: The editor MUST display every placement of an opened level as a simple box proxy at the position
  recorded in the file, without loading or rendering the real model geometry.
- **FR-002**: The editor MUST group objects by layer, and MUST allow showing and hiding each layer independently,
  with an object remaining visible while at least one of its layers is shown.
- **FR-003**: The editor MUST visually distinguish objects that resolve a model from objects that do not.
- **FR-004**: The editor MUST allow selecting an object by clicking its proxy, and MUST allow reaching an object
  that is overlapped by another.
- **FR-005**: The editor MUST provide a free camera that can orbit, pan and zoom, and a command that frames the
  whole level or the current selection.
- **FR-006**: The editor MUST report, when a file carries no detectable placements, that the file has none, and
  MUST name the file it examined.

**Object data**

- **FR-007**: The editor MUST present, for the selected object, every attribute of the published placement record:
  name, position, rotation, scale, model, behaviour script, layers, shared state and status.
- **FR-008**: The editor MUST display, next to each attribute, the evidence that produced it, distinguishing an
  attribute confirmed by runtime evidence from one derived from the file structure alone.
- **FR-009**: The editor MUST display, for an object whose model record is shared, how many other objects use that
  record and which object physically owns its bytes.
- **FR-010**: The editor MUST reject a level file whose produced records do not conform to the published placement
  record contract, and MUST name the non-conforming records rather than displaying them.

**Editing**

- **FR-011**: Users MUST be able to change the position, the rotation and the scale of a selected object, both by
  dragging a gizmo in the view and by typing a value.
- **FR-012**: The editor MUST offer a distinct gizmo for moving, for rotating and for scaling, and MUST make clear
  which one is active.
- **FR-013**: The editor MUST refuse to edit an attribute whose evidence does not support editing it, and MUST
  state which evidence is missing.
- **FR-014**: The editor MUST allow undoing and redoing every edit made during a session.
- **FR-015**: The editor MUST show at all times which objects have unsaved changes.

**Safety**

- **FR-016**: The editor MUST evaluate the published safety rules for every edit and every duplication, and MUST
  display each triggered rule with its severity and the evidence behind it.
- **FR-017**: The editor MUST refuse any operation that triggers a blocking rule.
- **FR-018**: The editor MUST require an explicit acknowledgement, naming the consequence, before confirming an
  operation that triggers a critical rule.
- **FR-019**: The editor MUST mark objects that run a behaviour script, and MUST warn that such an object has been
  observed both to survive and to break a level when moved.
- **FR-020**: The editor MUST offer duplication only when the prepared plan is valid, and MUST offer as targets
  only the objects whose slot size matches the source.

**Save, patch and launch**

- **FR-021**: The editor MUST validate a save before writing anything, checking at minimum that the file length is
  unchanged and that no byte outside the edited objects and their declared reference counts has changed.
- **FR-022**: The editor MUST refuse to produce a patch from a save that failed validation, and MUST state why.
- **FR-023**: The editor MUST build the patch as a replacement of the edited archive only, leaving the original
  disc image and the user's own emulator installation untouched.
- **FR-024**: The editor MUST be able to launch the game on the produced patch, and MUST record the launch as an
  experiment carrying the inputs, the file hashes and the prediction stated before launching.
- **FR-025**: The editor MUST let the researcher record what was actually observed after a launch, and MUST keep
  that observation with the edit that produced it.
- **FR-026**: The editor MUST NOT overwrite files that a running game session is reading.

**Scope boundary**

- **FR-027**: The editor MUST NOT offer editing of geometry, collisions or script contents, and MUST NOT offer
  duplication that does not consume an existing slot.

### Key Entities

- **Placement**: the editable object of a level, as published by the placement record contract: identity, position,
  rotation, scale, model reference, behaviour reference, layer membership, shared state and per-attribute evidence.
- **Layer**: a named group that claims placements; an object may belong to several, and layers are the primary way
  a researcher navigates a level.
- **Proxy**: the box drawn in place of an object, carrying no geometry of its own, sized so that objects remain
  distinguishable at level scale.
- **Edit session**: the set of changes made to one level since it was opened, each attached to one object, with
  undo history and unsaved state.
- **Safety rule**: a named consequence of an operation, with a severity and the evidence that justifies it.
- **Save plan**: the description of what a save changes, produced before the file is written and checked against it.
- **Patch**: the replacement package built from a validated save, containing only the edited archive.
- **Experiment record**: the durable trace of a launch: inputs, hashes, prediction, observation, outcome.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A researcher opens a level of roughly seven hundred objects and sees the whole level, grouped by
  layer, in under five seconds, and can rotate the camera without visible stutter.
- **SC-002**: For every object of every level in the validation corpus, the inspector shows all nine attribute
  groups of the published record, and one hundred percent of the displayed records conform to that contract.
- **SC-003**: A researcher who has never used the tool can find a named object in a level and read its model path
  in under two minutes without consulting documentation.
- **SC-004**: A transform edit saved from the editor changes only the transform fields of the edited object; a
  byte comparison against the original file shows no other difference.
- **SC-005**: One hundred percent of the operations that trigger a critical or blocking rule display that rule
  before any confirmation is possible, and no blocking operation can be confirmed at all.
- **SC-006**: Every save that fails validation results in zero patches produced and zero launches.
- **SC-007**: The edit loop is demonstrated in the running game on at least two different levels, each with the
  predicted change observed in two identical runs of the same input.
- **SC-008**: Every launch started from the editor leaves a retrievable experiment record containing the inputs,
  the prediction and the observation.

## Assumptions

- The editor works on level files already decoded by the existing toolkit, and on the archives that toolkit can
  rebuild; extracting and rebuilding are not re-specified here.
- Proxies are drawn at a uniform default size, because the real bounds of a model are not resolved by the current
  placement record; making proxies match the real object size belongs to the later geometry work.
- Rotation is limited to the single heading angle the placement record carries; pitch and roll are not represented
  because no evidence locates them yet.
- The second validation level is `Level_000_Mining`, chosen because it carries the largest number of resolved
  placements after the tutorial and has never been used during development.
- Boots of the game are initiated by the researcher and are counted; the editor never launches the game on its own.
- One researcher edits one level at a time; there is no shared or concurrent editing.
- The repetition rule that governs the project applies unchanged: an observed effect counts as established only
  when the same input produces it twice.
- Game data, screenshots and memory dumps produced by the editor stay outside the repository.

## Follow-up: scripted movement diagnosis (2026-09-15)

The inspector must distinguish an initial placement position, a supported private trajectory, and a stored resource
whose visible copies may use another object's position. From a resource, provide selection links to its active
counterparts and to candidate creators only when the clone expression explicitly uses the creator as its anchor.
Conditional creation remains labelled as such; navigation never silently redirects an edit. Shared model storage
must not be described as shared placement coordinates. Script motion opcodes alone do not prove that a placement's
position is reset. A visually validated case must state its scope rather than claiming support for all scripted props.
No new editable script fields, flags, collision or gameplay operations are introduced.

## Follow-up: launch permission failures (2026-09-15)

When process creation is denied before MCP or Dolphin starts, report the failing component and explain that the
editor server must run in a context permitted to create processes. Keep the saved patch and record the failed stage
and original error. Do not retry through a shell or elevate automatically. A corrected server launch must preserve
the user's current history and be verified through the same editor launch endpoint.

## Dependencies

- The placement record contract and its validation, the model and layer resolution, and the safety rules, all of
  which exist and are validated over five level files.
- The archive rebuild, the replacement-only patch workspace and the emulator launch, all of which exist and are
  used by the current experiments.
- Gates M1, M2 and M3, which are PASS; without them this feature would not be permitted to start.

## Out of Scope

- Editing geometry, collisions, navigation data or the contents of behaviour scripts.
- Creating an object without consuming an existing slot.
- Importing new models or textures.
- Editing several levels at once, or several researchers editing the same level.
- Rendering the real appearance of an object.
