# Contract: editor process interface

Two interfaces. The command line starts the editor; the local HTTP interface is what the view and any script use.
Exit codes follow the toolkit: 0 success, 1 validation or experiment failure, 2 unsupported input, 3 usage or I/O.

---

## Command line

```
ssa-archive edit serve <level.bld.decoded>
    --archive <disc path>            archive the level belongs to, needed to patch and launch
    --entry <index>                  entry index of the level inside that archive
    [--fixups <map>]                 runtime fixup map, when the level has one
    [--port <n>]                     default 7378, bound to 127.0.0.1 only
    [--open]                         open the default browser on the view
```

Refuses to start, with exit code 2 and a named reason, when the gate files do not report M1 and M2 as PASS, when
the level file carries no detectable placement class, or when any resolved record fails
`specs/002-igz-entity-model/contracts/placement-v1.schema.json`.

Prints the session id and the view URL, then serves until interrupted.

---

## HTTP interface

Bound to `127.0.0.1` only. All request and response bodies are JSON. Every error body is
`{ "error": string, "reason": string, "rules": SafetyRuleView[] }`, with `rules` present when a safety rule caused
the refusal.

### `GET /api/session`

Returns the open session without its placements.

```json
{
  "id": "s_8f2c",
  "file": "...\\3-level.bld.decoded",
  "archive": "level/Level_027_Tutorial.bld",
  "entry": 3,
  "original_sha256": "...",
  "has_runtime_map": true,
  "detection": { "placement_type": 104, "model_type": 64, "strict": 429, "entries": 673, "runner_up": 0 },
  "counts": { "direct": 453, "indirect": 0, "ambiguous": 0, "absent": 220 },
  "dirty": false,
  "locked": false
}
```

### `GET /api/placements`

Returns every placement of the session.

```json
{ "placements": [ /* Placement v1 records, unchanged */ ], "layers": [ { "name": "Plants", "count": 38, "grades": { "medium": 12, "info": 26 } } ] }
```

**Contract rule**: each element validates against the frozen placement contract, `evidence` included. A server
that cannot produce a conforming record returns 500 with the offending offset rather than a partial record.

### `GET /api/placement/:offset`

One placement, plus the safety rules that apply to it and the duplication targets available for it.

The optional `script` diagnostic includes `movement`: `{ kind, targets, scripted, model_shared,
confidence, editable: false }`. `kind` is `resource`, `trajectory`, `unsupported_trajectory` or
`initial_position`. Each target contains `{ offset, name, position, relation, conditional }`, with relation
`counterpart` or `creator`. Positions are current session coordinates. Creator links require an explicit
clone-at-owner expression and remain conditional; supported startup recipes exclude incompatible creators.
This is navigation metadata, not edit permission, a simulation result or a guarantee of a visible change.
`clones` and `template_for` may carry `at_owner`; the existing fields remain available.

```json
{
  "placement": { /* Placement v1 */ },
  "safety": [ { "id": "SCRIPTED_PLACEMENT", "severity": "medium", "message": "...", "finding": "level.pushblock.track-dependency" } ],
  "replace_targets": [ { "offset": 3489344, "name": "weed_2_Template(16)", "span": 412 } ]
}
```

### `POST /api/edit`

Applies one intent to the session in memory. Writes nothing to disk.

Request: an `EditIntent`. Response:

```json
{ "applied": true, "placement": { /* updated Placement v1 */ }, "safety": [ ... ], "dirty": true, "undo_depth": 3 }
```

Refusals, all with status 409 and the rule that caused them:

| Case | `error` |
| --- | --- |
| attribute whose evidence is `none` | `EVIDENCE_MISSING` |
| replace whose plan is invalid | `PLAN_INVALID` |
| replace with mismatched slot sizes | `SPAN_MISMATCH` |
| critical rule not in `acknowledged` | `ACKNOWLEDGEMENT_REQUIRED` |

### `POST /api/undo` and `POST /api/redo`

No body. Returns the same shape as `/api/edit`, with the restored state.

### `POST /api/save`

Produces the file. Validates first and writes only when the plan is `VALID`.

Request: `{ "out": "<path>" }`, optional; defaults to a sibling of the opened file.

Response: `{ "plan": SavePlan, "written": "<path>" | null }`. Status 409 with `written: null` when the plan is
`INVALID`, and the plan still carries every failure so the researcher can see what was refused.

**Contract rule**: the plan is produced before the write and checked against the bytes actually written. A save
whose `bytes_changed_outside` is not zero is never written.

### `POST /api/patch`

Builds the replacement patch workspace from the last successful save.

Response: `{ "patch": PatchResult }`. Refuses with 409 `SESSION_LOCKED` while a launched run may still be reading
the previous patch, and with 409 `NOTHING_SAVED` when no valid save exists.

### `POST /api/launch`

Starts the game on the produced patch and opens an experiment record. **It returns as soon as the run is under
way and does not wait for it**: two boots take about ten minutes, far longer than any HTTP client will hold a
response open. The first run of this feature lost its second boot and its experiment record exactly that way, so
the shape is not a convenience, it is the fix.

Request: `{ "mode": "test" | "play", "prediction": "<optional expected effect>", "figure": "<optional path>" }`.

Response: `{ "launch": LaunchRecord }` with `running: true` and `experiment_id: null`, because the runner only
produces the id when it has a record. New modes synthesize a prediction from the save plan if omitted.
Refuses with 409 `ALREADY_RUNNING` when one is already under way or `STALE_PATCH` for edits made since patching. Takes the session lock immediately, because
the game starts reading the patch at once.

The user's Patch click may chain save, patch and launch when the visible automatic-launch checkbox is checked.
`test` runs the tutorial macro then closes the owned game; `play` loads a figure and leaves control to the user
until the game closes or `POST /api/launch/stop` aborts it. Explicit modes release the lock on completion/failure.
Legacy requests without `mode` retain required prediction and explicit observation semantics.

### `GET /api/launch`

The state of the current or last run: `{ "launch": LaunchRecord | null, "locked": boolean }`. While `running` is
true the `experiment_id` is null; when the run ends it carries the id, or `error` if the runner failed. The
promise and abort controller never appear in the response. `progress` reports booting, macro step/total, playing,
stopping and finished. `consumption.verified` proves replacement loading only, never a visual edit's effect.

### `POST /api/observe`

Records what was seen and releases the lock. Refuses with 409 `STILL_RUNNING` while the run is under way: there
is nothing to have observed yet.

Request: `{ "experiment_id": "...", "observed": "<what was seen>", "matched": true }`.

Response: `{ "launch": LaunchRecord, "locked": false }`.

### `GET /` and `GET /view/*`

Serves the view: `index.html`, the modules under `src/view/`, and `three` from `node_modules`. No other path is
served, and no path outside those two directories is reachable.

---

## What this contract deliberately does not expose

- No endpoint returns or accepts raw file bytes. The view cannot write a byte even by mistake.
- No endpoint applies an edit directly to disk; `POST /api/edit` changes memory only, and `POST /api/save` is the
  single place where a file is produced.
- No endpoint edits geometry, collision data or script contents, and none creates a placement without consuming an
  existing slot. Those are out of scope for this feature and absent from the interface, not merely disabled in the
  interface.

The confirmed tutorial Drifting_Piece position edit also translates private type-148 waypoint xyz reached by
the placement's +0xE4 list. It changes existing coordinates only, preserving instruction bytes and list shape.
Save plans include these extra words as `attribute: "trajectory"`; undo/redo restores them byte-exactly.
Unknown layouts and shared trajectories refuse the position edit.

## Scenery rendering extension (2026-09-14)

`GET /api/meshes` returns `{ stats, models, scenery, unresolved, scripted_previews, scene_roles }`. All arrays of positions/indices use the
existing base64 little-endian Float32/Uint32 wire format. Models keep their placement-local coordinates.

`scenery` is `{ space: "world", confidence: "LIKELY", editable: false, units, chunks }`. A chunk includes
`descriptors` (source draw-unit ids), `units`, `vertex_count`, `triangle_count`, `positions`, `indices`,
`bounds` (computed from its vertices) and `large_surface` (a reversible preview hint). World chunks must
not receive a placement transform or be submitted as edit targets. Batches target 32,768 vertices; a single
unit larger than this is kept intact. The candidate rule is unassigned interleaved units with fraction 6.
Separate-array or other-fraction resources remain in `unresolved`, with descriptor, kind, fraction and reason.

`stats.assigned_unique + stats.scenery + stats.unresolved == stats.draw_units`. `owned` remains a count of
model-unit associations, which may double-count shared geometry. Legacy `world` is the unassigned count,
equal to `scenery + unresolved`. `complete` and `stop` describe decoding, not scene fidelity or editability.
Large surfaces use a size threshold of half the placements' extent, with a minimum of 32 world units; the
view can draw them solid or wireframe independently of their semantic identity.

`scripted_previews` adds read-only LIKELY tutorial bridge/dock and ID-10 cannon assemblies; each has
owner, template, model, position, heading, scale, heading_offset, fixed_heading and scale_mode. Bridge yaw
is the creator's yaw minus 90 degrees; cannon top follows creator yaw while the initial base yaw is fixed.
The view preserves those rules during refresh and resolves preview picking to the owner. These previews
do not add editable placements or affect save plans. See `docs/editor-scene-poses.md` for runtime scope.

`scene_roles` contains tutorial-only `{ offset, role: "template_or_inactive", confidence: "LIKELY",
editable: false, counterparts: [{offset,name}] }` display hints from the initially inactive/template flag.
The view hides these stored objects by default under a reversible layer, without changing file visibility.
`GET /api/placement/:offset` includes `script` diagnostics (clone resources, template users, animation presence,
confirmed drifting-path support and scene_role). These describe static references, not a simulated script execution.
