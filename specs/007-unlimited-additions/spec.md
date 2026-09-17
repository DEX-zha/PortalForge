# Feature Specification: Add any object, anywhere, as many times as wanted

**Feature Branch**: `feat/007-unlimited-additions`

**Created**: 2026-09-17

**Status**: Phases A and S (S01 to S06b) implemented and booted on 2026-09-17. Every object of a level can be
added and is verified by each launch; a level never measured is measured by its first launch, which writes the
additions into the running game (Undead Volcano, two boots); a scene is not bounded by the Gecko area (152 additions
on Mining through three tables, two boots); added enemies move and were seen on screen. Open: a table for play
without the editor (S09; S08 reserved 256 KB on two boots with a control), a campaign with savestates for objects with nothing to draw (S07), the activation
flag (phase B), objects of other levels (phase C). Rendering was looked at for the added enemies only. See
[validation](validation.md) and [tasks](tasks.md). Phase P delivers the read-only Whole game catalogue
(8 800 kinds across 75 scenes); C06 delivers per-file script diagnostics. Cross-level import remains unbuilt.

**Input**: User request (translated from French): "Analyse the project and everything we did. We still cannot add
as many objects as we want, and we cannot add objects from other levels, which is limiting. Make that possible:
adding any enemy or game object is the main objective for me. It has to be robust and proven, but without
verifying every object by hand, which would take enormous time. Add it to the specs and the plan once the solution
is found."

## Initial constraints before phases A and S (historical baseline)

| Limit | Cause | Evidence |
|---|---|---|
| At most 8 additions per patch | eight is what two boots confirmed, not what fits: the recipe keeps one 144-byte slot per addition in the 3 256 bytes that Dolphin's Gecko area leaves once its code handler is installed, and the code is already a loop over those slots. Measured: 18 fit with that slot, 59 with a 40-byte row | `native-patch.mjs`: `NATIVE_LIMIT`, `GECKO_CODE_BUDGET`, `nativeCapacity` |
| Additions on the tutorial only | two absolute addresses: the tutorial's resident section base (`0x80DBC020`) from which every source is addressed, and a tutorial placement used as the "level is ready" anchor (`0x81105604`, the sunflower source). A third binding is the call context: script-less sources are created at the return of a script's own clone call, which needs a script cloning something when the level starts | `native-patch.mjs`; the snapshot located Mining's base at `0x80DC6F48` |
| Nine sources only | every exact source needs two boots by rule; 234 testable families on the tutorial alone | [005 compatibility](../005-native-object-addition/compatibility.md) |
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

**Independent Test**: on Mining, drop 40 objects of 20 different families (resident swarmers, barrels, lanterns, loot,
push-block art) in front of the opening camera; two boots show all 40 constructed with an actor at the requested
position, and the captures show them.

**Acceptance Scenarios**:

1. **Given** any level opened by name, **When** an addition is dropped, **Then** the patch uses that level's
   measured parameters, or an inert live table whose rows and anchor are filled at launch after measuring it.
2. **Given** N additions above the 59-row capacity, **When** N is at most the editor guard of 590, **Then** the
   editor launch refills the table in batches and retains every result. Plain play is explicitly unsupported
   for that scene. Above 590 the edit is refused without mutation; 590 is not a tested capacity claim.
3. **Given** a resident source without its own confirmed recipe, **When** it is dropped at scale 100, **Then**
   it is marked experimental, accepted and inspected by each launch. A family report never confirms the source.

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

### User Story 5 - Find any object of the game in the Project tab (Priority: P1)

Asked on 2026-09-17, late (translated): "Any object must be addable in any map, so potentially objects that come
from other levels. The Project tab will have to be organised better, with folders. Think of an implementation
without conflicts."

The user browses the Project tab like a content tree: enemies, game elements, loot, destructibles, the level's own
objects, logic. The folders come from what the game itself says about each record (the library it was compiled
from, the directory of its script), never from guesses on display names. A switch widens the tree from **This
level** to the **Whole game**: every kind of object of the 75 scenes (76 archives including the placement-free Title screen), with the levels that hold it. A kind that
also exists in the open level is added from this level's own copy; a kind that does not says where it lives.

**Independent Test**: on Mining, *Enemies / Elemental_Swarmer* holds the swarmer template and its set-ups and
nothing else; every one of the 617 objects sits in exactly one folder; under **Whole game** the Chompy shows the
levels that hold it and, on a level that has the Chompy library, offers this level's copy.

**Acceptance Scenarios**:

1. **Given** any level, **When** the Project tab opens, **Then** every object sits in exactly one folder, and two
   different kinds never share a card because their display names are equal.
2. **Given** the Whole game scope, **When** a kind exists in the open level, **Then** its card adds this level's
   own record; **When** it does not, **Then** the card names the levels that hold it and adds nothing.
3. **Given** two levels with a record at the same file offset, **When** reports, additions or catalogue entries
   are stored, **Then** none of them can be read as the other level's.

### User Story 6 - Additions never cost the level its own objects (Priority: P1)

The user fears that adding many objects makes the game drop others. A launch can count the level's own objects
that are active with an actor, before and after the additions.

**Independent Test**: two boots of Mining, one addition and 152 additions: the count of the level's own active
objects is read at every reading of both and compared.

### User Story 4 - Proof without hand work (Priority: P1)

Validation runs as campaigns: many sources per boot, machine judgement from memory and captures, and family
reports kept with their run ids. Findings follow the usual two-boot review; a family result does not confirm
every source in that family. Nobody has to boot one object at a time.

## Requirements *(mandatory)*

- **FR-001**: The native recipe takes its base and anchor from the level's newest scene snapshot when one exists.
  On a level without a snapshot, the editor patches the empty live table, measures the level at its first capture,
  and writes the rows (with source addresses derived from that base), then the anchor, then the count into the running game. It keeps that measure as the scene snapshot.
- **FR-002**: The capacity of a self-contained Gecko patch is measured by compiling against its budget, not
  assumed. The editor can refill the live table while it drives a run; its 590-addition guard is not a measured
  game capacity. A refusal states which limit was reached.
- **FR-003**: Any resident placement record of the level is an admissible source: placed or template, with or
  without a model, scripted or not. Its card states the evidence (verified in game n times, not verified yet,
  failed with the reason); the evidence never blocks the addition (user decision of 2026-09-17, see the
  [study](study-add-anything.md) and constitution 1.2.0).
- **FR-003a**: Every launch verifies from memory the additions it carries and files the result per family, so
  that evidence accumulates from ordinary use.
- **FR-003b**: The table of additions can be written into the running game, so that one boot verifies a whole
  level and a scene is not bounded by the Gecko budget while the editor drives the run.
- **FR-004**: A campaign boots batches of sources (target: 20 to 40 per boot), verifies each instance in memory
  (class, state, actor, requested transform) and by capture, and records per-family runtime reports with the run ids. A command to prepare finding drafts for review
  remains T010; reports never promote a source automatically.
- **FR-005**: The activation flag (+0x54 bit 0) is an editable property once confirmed: placed to stored removes
  an object, stored to placed reveals a template; the save plan authorises exactly that word.
- **FR-006**: Cross-level import is gated by M4A and specified as experiments (plan.md, phase C); until a level
  loads with an imported library, the catalogue offers other levels' objects as "not in this level" with the
  levels that hold them.
- **FR-008**: An object kind is identified across levels by its model and script paths within the game's Content
  tree (by its bare name when it has neither), never by its display name alone or its file offset; the libraries
  that carry it are
  attributes of the kind. A record outside the open level is always named with its level.
- **FR-009**: Project folders derive from the record's library and script directory (the game's own content
  tree); display names decide nothing. Every entry falls in exactly one folder.
- **FR-010**: The game-wide catalogue is built from the decoded levels, kept under `.local/` with each level's
  digest, rebuilt for a level whose digest changed, and never committed.
- **FR-011**: A kind absent from the open level is never patched into it before phase C has loaded an imported
  library twice; until then its card states the levels that hold it.
- **FR-012**: A launch can count the level's own active objects before and after its additions (the census), so
  that "additions push originals out" is a measured statement.
- **FR-013**: More than one table of additions in plain play needs storage outside the Gecko area, reserved
  through the OS arena (plan, S08 and S09); until it is proven such a scene says it needs the editor's launch.
- **FR-007**: Every confirmed capability keeps the evidence rule: two identical boots, consumption proven, and a
  visible result. A family report groups runtime results; it does not grant Add or CONFIRMED to its members.
  An experimental source remains labelled experimental even when its family has successful boots, until its own
  recipe receives a reviewed CONFIRMED finding.

## Success Criteria *(mandatory)*

- **SC-001**: Additions work on a second level (Mining) with the same recipe, two boots.
- **SC-002**: At least 32 additions in one patch, two boots, all constructed.
- **SC-003**: A campaign covers every family of Mining's templates in under two hours of unattended Dolphin time
  and yields findings for each.
- **SC-004**: The activation flag removes and reveals objects on two boots each.
- **SC-005**: One library imported from one level into another loads and its template is cloneable, two boots.
- **SC-006**: The census of a boot with 152 additions is compared with a control boot's, reading by reading.
- **SC-007**: On every one of the 75 scenes with placements each object falls in exactly one Project folder, with no folder decided
  by a display name; the Whole game scope lists every kind with its levels.

## Out of scope

Editing what a script does (the scripts are compiled); gameplay validation of added enemies beyond creation,
movement and survival within activation range (M5); new geometry (M4A) or collision (M4B).
