# Data Model: IGZ v5 Level Object Model

Reuses `Experiment`, `ResearchFinding` and `ValidationGate` from `specs/001-ssa-level-research/data-model.md`.

## ObjectGraph (`contracts/object-graph.schema.json`)

| Field | Type | Rule |
| --- | --- | --- |
| `file`, `sha256`, `size` | | Decoded IGZ (`.decoded` entry of a workspace) |
| `header` | `{magic, version, words[]}` | `magic == 0x49475A01`, `version == 5` |
| `sections[]` | `{index, offset, size, align, tag}` | Last section ends at `size`; sections do not overlap |
| `types[]` | `{index, name, size_hint}` | `name` may be empty; `size_hint` from the per-type table, confidence UNKNOWN until R2 |
| `objects[]` | `{offset, size, type, type_name, id, fields[]}` | `size > 0`; `offset + size <= next.offset`; `id` = third header word |
| `fields[]` | `{offset, kind, value, target?}` | `kind` in `u32, f32, string_ref, object_ref, flagged_ref, unknown` |
| `unparsed[]` | `{offset, size, note}` | Regions of the object area not covered by objects |
| `accounting` | `{objects, unparsed, padding, total}` | `objects + unparsed + padding == total` (SC-001) |

## EntityRecord

| Field | Type | Rule |
| --- | --- | --- |
| `object_offset`, `type_name` | | From the graph |
| `fields` | `{name -> {offset, type, confidence, finding_id}}` | Every named field has a finding record; `position` typed `f32be x3` |
| `confidence` | enum | Minimum over its named fields |

Rule: a field may be used by `clone` only when its finding is CONFIRMED (FR-005, constitution I).

## DuplicationPlan (`contracts/duplication-plan.schema.json`)

| Field | Type | Rule |
| --- | --- | --- |
| `source` | `{object_offset, type_name, finding_id}` | Finding must be CONFIRMED |
| `changes[]` | `{field, type, old_hex, new_hex}` | Size-preserving field edits on the clone |
| `insert_at` | int | Append position in the object area (aligned to the section alignment) |
| `updates[]` | `{location, field, old, new}` | Object list count, list entries, section table offsets, ids |
| `new_id` | int | Unique among `objects[].id` |
| `validation` | `{status, failures[]}` | Graph accounting and reference resolution on the rebuilt file |

State: `DRAFT` -> `VALID` (validation passed) -> used by an M3 Experiment; a `FAIL` experiment records `failing_stage` in `validation, load, count, reference, observation`.

## M3 Experiment additions

`inputs.duplication` = the DuplicationPlan; `runs[]` must contain two identical patched runs; `status PASS` only when both observe two independent instances (FR-007).
