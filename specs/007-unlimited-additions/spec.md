# Feature Specification: Add any object, anywhere, as many times as wanted

**Feature Branch**: to be opened per phase (`feat/007a-native-any-level`, `feat/007b-activation-flag`,
`feat/007c-library-import`)

**Created**: 2026-09-17

**Status**: Phase A booted and S01 to S03 implemented (2026-09-17): additions work on Mining from placed objects
and stored templates (8 of 8, two boots), 32 fit in one patch (32 of 32, two boots), and every object of a level
with a scene snapshot can be added, verified by each launch. Rendering has not been looked at yet. See
[validation](validation.md) and [tasks](tasks.md).

**Input**: User request (translated from French): "Analyse the project and everything we did. We still cannot add
as many objects as we want, and we cannot add objects from other levels, which is limiting. Make that possible:
adding any enemy or game object is the main objective for me. It has to be robust and proven, but without
verifying every object by hand, which would take enormous time. Add it to the specs and the plan once the solution
is found."

## What stands in the way today, measured

| Limit | Cause | Evidence |
|---|---|---|
| At most 8 additions per patch | eight is what two boots confirmed, not what fits: the recipe keeps one 144-byte slot per addition in the 3 256 bytes that Dolphin's Gecko area leaves once its code handler is installed, and the code is already a loop over those slots. Measured: 18 fit with that slot, 59 with a 40-byte row | `native-patch.mjs`: `NATIVE_LIMIT`, `GECKO_CODE_BUDGET`, `nativeCapacity` |
| Additions on the tutorial only | two absolute addresses: the tutorial's resident section base (`0x80DBC020`) from which every source is addressed, and a tutorial placement used as the "level is ready" anchor (`0x81105604`, the sunflower source). A third binding is the call context: script-less sources are created at the return of a script's own clone call, which needs a script cloning something when the level starts | `native-patch.mjs`; the snapshot located Mining's base at `0x80DC6F48` |
| Nine sources only | every exact source needs two boots by rule; 234 testable families on the tutorial alone | `specs/005/compatibility.md` |
| No object from another level | a level archive is a compiled merge of libraries (`*.lvl` layers) holding their own models, textures, scripts and sounds; what is not compiled into the level is not in memory | census below |
| Duplication needs a victim | the header table cannot grow without shifting every record, and inserting inside a record's blob gets stomped by its constructor | `igz.loader.head-span-count-walk`, `igz.loader.blob-walk-stomps-insertions` |

Census of the 75 decoded levels (research.md): 736 distinct libraries, 149 of them enemy libraries. 374 libraries
exist in one level only, 284 in two to nine, 53 in ten to twenty-nine, 25 in thirty or more. Chompies are in 16
to 19 levels; most enemy libraries are in 3 to 13; bosses and one-off enemies in one. Each level stores a median
of 269 templates of its own. So "any enemy anywhere" cannot be reached by same-level cloning: it needs libraries
moved between levels.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add any object of the current level, as many times as wanted (Priority: P1)

The user drops any record of the open level, placed or template, enemy or prop, anywhere, on any level, dozens of
times, and finds every instance in game.

**Independent Test**: on Mining, drop 40 objects of 20 different families (Chompies, barrels, lanterns, loot,
push-block art) in front of the opening camera; two boots show all 40 constructed with an actor at the requested
position, and the captures show them.

**Acceptance Scenarios**:

1. **Given** any level opened by name with a scene snapshot taken once, **When** an addition is dropped,
   **Then** the patch carries it with that level's base and anchor, never the tutorial's.
2. **Given** N additions, **When** N exceeds the slots the Gecko area holds, **Then** the refusal names the
   capacity, and the capacity is not eight.
3. **Given** a source with no confirmed family, **When** it is dropped, **Then** the card says "Needs test" and
   the automatic campaign can test it in a batch with others, not alone.

### User Story 2 - Remove or reveal without a victim (Priority: P1)

The user disables a placed object (an enemy, an obstacle) or reveals a stored template at a chosen position, by
a one-word edit that changes no size.

**Independent Test**: flip `Barrel(20)` from placed to stored and `Rock_Breakable_Half` from stored to placed at
a visible spot; two boots show the barrel gone and the rock half standing there.

### User Story 3 - Add an object from another level (Priority: P1, research)

The user picks an enemy or object that the current level does not hold, from the catalogue of the 76 levels, and
gets it in the level with its model, textures, script and sounds.

**Independent Test**: bring `Enemy_Chompy` into a level that has no Chompy library; the level loads, the template
is listed, a native addition of it stands and moves in game on two boots.

### User Story 4 - Proof without hand work (Priority: P1)

Validation runs as campaigns: many sources per boot, machine judgement from memory and captures, families
promoted by evidence, results kept as findings. Nobody boots one object at a time.

## Requirements *(mandatory)*

- **FR-001**: The native recipe takes its base and anchor from the level's scene snapshot; a level without a
  snapshot cannot patch additions and says so.
- **FR-002**: The addition capacity is measured by compiling against the Gecko budget, not assumed; the editor's
  limit stays the number two boots confirmed (eight) and rises only with a capacity finding; a refusal states
  the number.
- **FR-003**: Any resident placement record of the level is an admissible source: placed or template, with or
  without a model, scripted or not. Its card states the evidence (verified in game n times, not verified yet,
  failed with the reason); the evidence never blocks the addition (user decision of 2026-09-17, see the
  [study](study-add-anything.md); needs the constitution amendment written there).
- **FR-003a**: Every launch verifies from memory the additions it carries and files the result per family, so
  that evidence accumulates from ordinary use.
- **FR-003b**: The table of additions can be written into the running game, so that one boot verifies a whole
  level and a scene is not bounded by the Gecko budget while the editor drives the run.
- **FR-004**: A campaign boots batches of sources (target: 20 to 40 per boot), verifies each instance in memory
  (class, state, actor, requested transform) and by capture, and records one finding per family with the run ids.
- **FR-005**: The activation flag (+0x54 bit 0) is an editable property once confirmed: placed to stored removes
  an object, stored to placed reveals a template; the save plan authorises exactly that word.
- **FR-006**: Cross-level import is gated by M4A and specified as experiments (plan.md, phase C); until a level
  loads with an imported library, the catalogue offers other levels' objects as "not in this level" with the
  levels that hold them.
- **FR-007**: Every capability keeps the evidence rule: two identical boots, consumption proven, visible result;
  a family is promoted from a batch, an object from its family, and any failure demotes the family.

## Success Criteria *(mandatory)*

- **SC-001**: Additions work on a second level (Mining) with the same recipe, two boots.
- **SC-002**: At least 32 additions in one patch, two boots, all constructed.
- **SC-003**: A campaign covers every family of Mining's templates in under two hours of unattended Dolphin time
  and yields findings for each.
- **SC-004**: The activation flag removes and reveals objects on two boots each.
- **SC-005**: One library imported from one level into another loads and its template is cloneable, two boots.

## Out of scope

Editing what a script does (the scripts are compiled); gameplay validation of added enemies beyond creation,
movement and survival within activation range (M5); new geometry or collision (M4B).
