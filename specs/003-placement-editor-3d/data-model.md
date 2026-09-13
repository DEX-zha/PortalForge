# Phase 1 data model: 3D placement editor

Entities the editor holds while a level is open. The placement itself is not redefined here: it is the frozen
contract `specs/002-igz-entity-model/contracts/placement-v1.schema.json`, and everything below refers to it.

---

## EditorSession

One open level. The session owns the bytes; nothing else may write them.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | opaque handle used by every request |
| `file` | absolute path | the decoded level file that was opened |
| `archive` | string | the disc path of the archive this level belongs to, needed to patch and launch |
| `entry` | integer | index of the level entry inside that archive |
| `opened` | timestamp | |
| `original_sha256` | string | hash of the file as opened; a save that no longer matches is refused |
| `placements` | Placement v1 [] | resolved once at open, revalidated against the frozen contract |
| `layers` | LayerView [] | derived from the placements |
| `detection` | object | the class detection result, kept so the view can show what was detected and with what margin |
| `has_runtime_map` | boolean | whether a fixup map was supplied for this level |
| `edits` | EditIntent [] | applied, in order |
| `undone` | EditIntent [] | popped by undo, cleared by a new edit |
| `dirty` | boolean | `edits` is non-empty and no save has succeeded since |
| `lock` | SessionLock or null | set while a launched game may be reading the produced patch |

**Validation**: opening fails when the gate files do not report M1 and M2 as PASS, when no placement class is
detected, or when any resolved record fails the frozen contract. The failure names the file and the reason; it
never produces an empty session that looks like a successful open.

**State transitions**:

```
opened ──edit──> dirty ──save(valid)──> saved ──patch──> patched ──launch──> launched
   ^               │                      │                                    │
   │               └──save(invalid)──> dirty (unchanged, reason returned)       │
   └──────────────────── undo to empty ───┘                     observe ────────┘
```

`launched` returns to `saved` only when the researcher records an observation, which releases the lock.

---

## LayerView

A named group as the view uses it. Derived, never authored.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | from the placement record's `layers` |
| `count` | integer | placements claiming this layer |
| `visible` | boolean | view state, default true |
| `grades` | object | how many of its placements fall in each safety severity |

**Rule**: a placement is visible when at least one of its layers is visible. A placement with no layer belongs to
a synthetic group named `(unlayered)` so that it can never become unreachable by hiding everything else.

---

## ProxyView

What is drawn for one placement. Derived from the placement record, held only in the browser.

| Field | Type | Notes |
| --- | --- | --- |
| `index` | integer | instance index, the identity used by picking |
| `offset` | integer | the placement offset, the identity used by the editor process |
| `position` | number [3] | from the record, through the coordinate mapping |
| `heading` | number | degrees |
| `scale` | number | record value divided by 100 |
| `shape` | `box` or `marker` | box when a model resolves, marker when none does |
| `grade` | severity | worst safety severity of the placement, drives colour |

---

## EditIntent

A requested change, before it is applied. The view produces these; it never produces bytes.

| Field | Type | Notes |
| --- | --- | --- |
| `kind` | `transform` or `replace` | |
| `target` | integer | placement offset |
| `position` | number [3] or null | transform only |
| `heading` | number or null | transform only |
| `scale` | number or null | transform only, in record units |
| `source` | integer or null | replace only, the placement being copied |
| `acknowledged` | string [] | ids of the critical rules the researcher explicitly accepted |

**Validation**: a `transform` intent is refused when the placement's evidence for the attribute is `none`, and a
`replace` intent is refused when the prepared plan is invalid, when the slot sizes differ, or when a critical rule
it triggers is missing from `acknowledged`. Refusals carry the rule that caused them.

---

## SafetyRuleView

A rule as the interface must present it. The shape is produced by the existing rules module.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | stable identifier, also what `acknowledged` refers to |
| `severity` | `blocking`, `critical`, `high`, `medium`, `info` | |
| `message` | string | written for a person, naming the consequence |
| `finding` | string | the finding that justifies the rule |

**Rule**: a `blocking` rule makes the operation impossible; a `critical` rule makes it possible only after an
explicit acknowledgement that names the consequence. The other severities are displayed and do not gate.

---

## SavePlan

What a save will do, produced before anything is written and checked against what was written.

| Field | Type | Notes |
| --- | --- | --- |
| `status` | `VALID` or `INVALID` | |
| `changes` | object [] | field, old and new value, per edited placement |
| `failures` | object [] | why it is invalid, empty when valid |
| `warnings` | string [] | including every shared record the write rewrites |
| `shared_records` | object [] | offset, external user count, whether bytes change, name before and after |
| `file_length_unchanged` | boolean | |
| `bytes_changed_outside` | integer | must be zero for a valid save |

---

## PatchResult and LaunchRecord

| Field | Type | Notes |
| --- | --- | --- |
| `patch.dir` | path | the replacement-only workspace under `.local/patches/` |
| `patch.replacements` | object [] | disc path and file, one entry, the edited archive |
| `patch.rebuilt_sha256` | string | hash of the rebuilt archive, the identity two runs must share |
| `launch.experiment_id` | string | the experiment record this launch belongs to |
| `launch.prediction` | string | stated before the game starts; the launch is refused without it |
| `launch.observed` | string or null | filled by the researcher afterwards |
| `launch.matched` | boolean or null | their judgement |

**Rule**: a launch without a prediction is refused. An observation is what releases the session lock, so a run
cannot be silently forgotten.

---

## SessionLock

| Field | Type | Notes |
| --- | --- | --- |
| `patch_dir` | path | the workspace a running game may be reading |
| `since` | timestamp | |

**Rule**: while a lock is held, a save may still be produced but the patch step refuses to rebuild into that
directory. This is what makes FR-026 a mechanism rather than a habit.

---

## Relationships

```
EditorSession 1 ── * Placement v1 (frozen contract)
EditorSession 1 ── * LayerView          derived from placements
EditorSession 1 ── * EditIntent         ordered, undoable
EditIntent    * ── * SafetyRuleView     evaluated per intent
EditorSession 1 ── 0..1 SavePlan        the last one produced
SavePlan      1 ── 0..1 PatchResult     only when VALID
PatchResult   1 ── * LaunchRecord       one per launch
EditorSession 1 ── 0..1 SessionLock     held while a launched run may read the patch
Placement     * ── 1 model record       shared; the shared state is part of the frozen record
```
