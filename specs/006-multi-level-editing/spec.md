# Feature Specification: Multi-level editing

**Feature Branch**: `feat/006-multi-level-open`

**Created**: 2026-09-17

**Status**: Step 1 of the roadmap implemented and validated offline (open any level, move its objects, switch levels from the editor); the in-game proof on a non-tutorial level is pending the user's boots. Steps 2 to 6 are specified as backlog in [docs/editor/roadmap.md](../../docs/editor/roadmap.md).

**Input**: User request (translated from French): "We have a very good base. I would like every object to be placeable and working, to load levels other than the tutorial directly, and to edit those levels as well. Can we do it, or are there bigger priorities on the project right now?" The assessment that followed ordered the work: open and move first, runtime maps per level second, the family campaign third, the addition cap fourth, direct entry per level fifth, native additions elsewhere and gameplay last. The user then asked to set that roadmap up, "paying attention to objects and terrain".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open any level of the disc by name (Priority: P1)

A researcher names a level, on the command line or in the editor's picker, and the editor opens it: the original
archive is extracted from their game image if it never was, the archive is decoded if it never was, the level
entry is found by its name inside the archive, the runtime map captured for that level is loaded when one exists,
and the view opens on the level's placements and scenery. The view states what the editor can do on that level
and on which evidence, so nothing is greyed out without a reason next to it.

**Why this priority**: every other step of the roadmap needs a level open. Until now the editor was started on a
decoded file located by hand, with the entry index typed in, and the interface assumed the tutorial in several
places.

**Independent Test**: `edit levels` lists 76 levels; `edit open Level_000_Mining --open` serves Mining with 617
placements; the picker in the header lists the same 76 levels grouped by family with Mining selected; the Level
information panel says transforms are LIKELY, duplication needs a runtime map, additions, the automatic test and
direct entry are tutorial-only.

**Acceptance Scenarios**:

1. **Given** a level name, a disc path or a workspace name, **When** the researcher opens it, **Then** the session
   carries that level's disc path and the entry index read from the archive's manifest, never an assumed index.
2. **Given** a level whose original was never extracted, **When** it is opened with a game image configured,
   **Then** the original is extracted under `.local/samples` and the workspace decoded under
   `.local/workspaces/<name>-all`; **When** no image is configured, **Then** the opening is refused with `NO_GAME`
   and nothing is written.
3. **Given** a query that matches no level, **When** it is opened, **Then** the refusal names the closest levels.
4. **Given** an open level, **When** the researcher reads the level information, **Then** each capability
   (transform, duplicate, add, automatic test, direct entry) shows CONFIRMED, LIKELY or not available, with the
   finding behind it.

---

### User Story 2 - Move an object on another level and get a patch (Priority: P1)

The researcher moves, rotates or scales a placement of a non-tutorial level, saves, builds the patch, and launches
normal play to navigate to the level and look.

**Why this priority**: the placement record has the same layout on every level of the disc (43 258 placements,
100% schema-valid), so the writer already exists; what is missing is the honest labelling and the proof.

**Independent Test**: open Mining, raise one prop by 8 units, save; the plan lists exactly three changed words;
the patch rebuilds the archive with the saved entry; the launch modes offer normal play only.

**Acceptance Scenarios**:

1. **Given** a non-tutorial level, **When** a transform is saved, **Then** the written file differs from the
   original only in the authorised words, and the plan says so.
2. **Given** a non-tutorial level, **When** the researcher looks at the launch modes, **Then** the tutorial macro
   and direct entry are disabled and normal play is selected.
3. **Given** a non-tutorial level, **When** the researcher reads the transform capability, **Then** it is LIKELY,
   citing `level.transform.other-levels`, with the sentence that the in-game effect is confirmed on the tutorial
   only.

---

### User Story 3 - Switch levels without losing work by accident (Priority: P2)

The researcher picks another level in the header and presses Open. If the scene has unsaved edits the editor asks
before discarding them; if a Dolphin run or a validation batch holds the session the switch is refused.

**Independent Test**: edit an object, press Open on another level: the discard dialog appears naming the number of
unsaved edits; Cancel keeps the level; Discard and open loads the other level with an empty history.

**Acceptance Scenarios**:

1. **Given** unsaved edits, **When** Open is pressed, **Then** the server answers `UNSAVED_CHANGES` with the undo
   depth and nothing changes until the researcher confirms.
2. **Given** a locked session, **When** Open is pressed, **Then** the server answers `SESSION_LOCKED`.
3. **Given** a server started on one file with `edit serve`, **When** Open is requested, **Then** the server
   answers `OPEN_UNAVAILABLE` and the picker stays hidden.

---

### User Story 4 - Objects and terrain read correctly on every level (Priority: P2)

Whatever the level, the objects sit on the decoded scenery, the proxies are a readable size, the grid fits the
level, and nothing about the tutorial is silently assumed.

**Independent Test**: headless previews with meshes of Mining, Haunted Castle, Hub stage 1, Challenge 005 and
Dark Forest show the objects on their terrain; Haunted Castle's extent is about 1 200 units, not 31 000.

**Acceptance Scenarios**:

1. **Given** a level that parks objects far away (BossCamera, PhaseDirector, EvilPortalMaster at
   30480, 30480, 30480), **When** it is opened, **Then** the parked objects are drawn and selectable but excluded
   from the extent that sizes the proxies, the grid and the large-surface rule, and the tally says how many.
2. **Given** the tutorial, **When** it is opened after this change, **Then** its extent, proxy size and grid are
   unchanged, because it parks nothing.
3. **Given** a non-tutorial level, **When** the scene is built, **Then** the tutorial-only previews (bridges,
   cannons, disabled templates) are absent rather than wrong, and the Project browser reports zero Add sources.

### Edge Cases

- `Title.bld` has zero placements: opening it is refused as `OPEN_REFUSED` with the session's reason, and the
  picker shows it with `0` so nobody is surprised.
- A workspace whose manifest exists but whose level entry was never decoded is decoded on open.
- An uncompressed level entry is its own decoded form; it is materialised once under the decoded name.
- A configured runtime map whose file is missing is skipped silently; the level opens without a map.
- Two workspaces hold the tutorial (`tutorial-bld`, `level_027_tutorial-all`): both decode to the same bytes
  (SHA-256 `2976f359…`), and the catalogue uses the canonical `-all` one.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The catalogue lists every level for which the machine holds an original under `.local/samples` or a
  decoded workspace named `<lowercase name>-all` under `.local/workspaces`; experiment workspaces are ignored.
- **FR-002**: A level is opened by disc path, by name with or without `.bld`, or by workspace name; the entry is the
  `.bld` inside the archive, found by name.
- **FR-003**: Missing originals are extracted from the configured game image only; missing workspaces are decoded
  in place; nothing is written outside `.local/`.
- **FR-004**: The runtime map of a level is looked up in this order: `runtime_maps` in `.local/dolphin-config.json`
  (or `PORTALFORGE_RUNTIME_MAPS`), then `.local/dolphin-evidence/runtime-maps/<name>.json`, then the historical
  tutorial map. Absence never blocks reading; it blocks duplication.
- **FR-005**: Each level carries capabilities for transform, duplicate, add, test and direct entry, each with
  `available`, `confidence`, `finding` and `why`; the view shows them.
- **FR-006**: `GET /api/levels` and `POST /api/open` follow [contracts/levels-api.md](contracts/levels-api.md);
  a switch is refused while locked, running or validating, and while dirty unless `discard` is true.
- **FR-007**: Placements parked more than three level-widths outside the bulk of the level are excluded from the
  framing extent and counted; they remain drawn, selectable and editable.
- **FR-008**: Transforms on non-tutorial levels are labelled LIKELY and cite `level.transform.other-levels`; no
  capability is promoted without its own finding.

### Key Entities

- **Level catalogue entry**: archive, key, name, family, tutorial, original, workspace (dir, present, entry),
  runtime_map (file, source), placements, direct_entry, ready, capabilities.
- **Session level**: name, family, tutorial, runtime_map, capabilities; exposed by `GET /api/session` as `level`.

## Success Criteria *(mandatory)*

- **SC-001**: All 76 levels of SSPP52 Rev1 open by name in under one second each on the reference machine.
- **SC-002**: The headless previews of five non-tutorial levels show the objects on their terrain, and no level's
  extent is inflated by parked objects.
- **SC-003**: The real-browser scenario (`tests/browser-multilevel.mjs`) passes with zero JavaScript exceptions:
  picker with 76 levels, discard dialog, switch to a Challenge level, return to the tutorial with its CONFIRMED
  capabilities.
- **SC-004**: Two identical cold boots of an edited non-tutorial level show the predicted effect (pending; this
  promotes `level.transform.other-levels` to CONFIRMED).
- **SC-005**: The full test suites pass (319 SSA, 6 MCP) and lint and formatting are clean.

## Out of scope

Runtime maps per level (step 2), the family campaign and the promotion rule (step 3), the addition cap (step 4),
direct entry per level (step 5), native additions outside the tutorial and gameplay validation (step 6). Each is
described in the roadmap with its cost and its evidence rule.
