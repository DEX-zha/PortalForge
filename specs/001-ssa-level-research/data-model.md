# Data Model: SSA Level Research

> Scope reviewed 2026-09-17: this feature records its original design and evidence. Later extensions and
> remaining work are mapped in the [specification status](../README.md); historical limits below are not the
> current editor limits.

Entities from the specification's Key Entities, refined by Phase 0. All persisted forms are JSON files under `.local/` (game-derived) or Markdown under `docs/` (findings). Byte values are integers; hashes and byte dumps are lowercase hex strings.

## SourceGameCopy

| Field | Type | Rule |
| --- | --- | --- |
| `path` | string | Absolute path of the WBFS; opened read-only; never written |
| `game_id` | string(6) | From DolphinTool header; must be `SSPP52` for supported operations (FR-001, edge case: unsupported dump) |
| `region`, `revision`, `internal_name` | string, int, string | As reported |
| `file_list_sha256` | hex | Hash of the DATA partition listing, to detect a different dump |

## Archive

| Field | Type | Rule |
| --- | --- | --- |
| `disc_path` | string | e.g. `level/Level_027_Tutorial.arc` |
| `sha256`, `size` | hex, int | Of the extracted original |
| `header` | ArchiveHeader | See below |
| `entries` | Entry[] | Length = `header.count`; order preserved |
| `chunk_tables` | ChunkTable[] | Empty for fully uncompressed archives |
| `validation` | ValidationReport | `status` in `VALID`, `INVALID`, `UNSUPPORTED` |

### ArchiveHeader

| Field | Type | Rule |
| --- | --- | --- |
| `magic` | int | Must equal `0x1A414749` |
| `version` | int | Must equal 4; other versions -> `UNSUPPORTED` (assumption: v4 only) |
| `table_size` | int | Word 0x08; preserved verbatim |
| `count` | int | Word 0x0C; > 0 |
| `flags_packed` | int | Word 0x10; preserved verbatim (UNKNOWN semantics) |
| `word_14`, `word_20`, `word_24`, `word_28`, `word_2c` | int | Preserved verbatim |
| `name_table_offset`, `name_table_size` | int | `offset + size == archive size` |
| `hashes` | int[count] | Strictly ascending |

### Entry

| Field | Type | Rule |
| --- | --- | --- |
| `index` | int | Position in the entry table |
| `name` | string | From name table; unique within archive |
| `hash` | int | `hashes[index]`; copied verbatim on rebuild |
| `start`, `size` | int | `start % 0x800 == 0`; `start + stored_size <= name_table_offset`; no overlap with other entries |
| `mode` | int | High byte in `{0xFF, 0x10}`; other values -> validation failure `UNSUPPORTED_MODE` |
| `compression` | enum | `NONE`, `LZMA_CHUNKED` derived from `mode` |
| `chunk_table_index` | int or null | `mode & 0xFFFFFF` when compressed |
| `stored_size` | int | Bytes occupied on disc (compressed size incl. alignment) |
| `data_sha256` | hex | Of stored bytes, used by diff and verify |

### ChunkTable

| Field | Type | Rule |
| --- | --- | --- |
| `offset` | int | Absolute offset of the u16 array |
| `values` | int[] | Raw u16 values preserved verbatim until semantics are CONFIRMED |
| `decoded` | object or null | Populated only when decoding succeeded; carries confidence |

### ValidationReport

| Field | Type | Rule |
| --- | --- | --- |
| `status` | enum | `VALID`, `INVALID`, `UNSUPPORTED` |
| `failures` | Failure[] | Each: `offset`, `field`, `actual`, `expected`, `reason` (FR-006) |

## ExtractedWorkspace

Directory `.local/workspaces/<archive-id>/` with `manifest.json` (schema `contracts/workspace-manifest.schema.json`) and `entries/<index>-<basename>` files.

| Field | Type | Rule |
| --- | --- | --- |
| `source` | Archive reference | `disc_path`, `sha256`, `size` |
| `header_words` | int[12] | Verbatim header |
| `entries[]` | Entry + `file` | `file` relative path of the extracted stored bytes; `decoded_file` optional when decompressed |
| `chunk_tables[]` | ChunkTable | Verbatim |
| `created_at`, `tool_version` | string | Reproducibility |

Rule: a workspace is rebuildable only if every entry file's sha256 still matches `data_sha256` or the entry is marked `replaced`.

## RebuiltArchive

| Field | Type | Rule |
| --- | --- | --- |
| `path`, `sha256`, `size` | | |
| `strategy` | enum | `BYTE_PRESERVING`, `REENCODE_REPLACED` |
| `replaced_entries` | int[] | Indexes whose bytes changed |
| `validation` | ValidationReport | Must be `VALID` before use in a patch (FR-005) |
| `diff` | DiffReport | Against the original |

### DiffReport

| Field | Type | Rule |
| --- | --- | --- |
| `regions[]` | `{offset, length, old_hex, new_hex, class}` | `class` in `METADATA`, `TABLE`, `CONTENT`, `PADDING` |
| `size_delta` | int | |
| `unclassified_bytes` | int | Must be 0 (SC-003) |

## PatchWorkspace

Directory `.local/patches/<experiment-id>/`.

| Field | Type | Rule |
| --- | --- | --- |
| `replacements[]` | `{disc_path, file, sha256, size}` | Only files that differ from the original are included (FR-009) |
| `xml` | path | Riivolution XML with `<id game="SSP" developer="52"><region type="P"/>` and one `<file>` per replacement, `resize="true"` |
| `descriptor` | path | `launch.json` with forward-slash paths |
| `expected_monitor_sizes` | `{disc_path: "N kB"}` | Used to prove consumption |

## Experiment

Record `contracts/experiment-record.schema.json`, stored in `.local/dolphin-evidence/experiments/<id>.json`.

| Field | Type | Rule |
| --- | --- | --- |
| `id`, `kind` | string, enum `M1_ROUNDTRIP`, `M2_MUTATION` | |
| `inputs` | object | archive, workspace, patch, figure, input script, for M2: `mutation {entry, offset, old_hex, new_hex, predicted_effect}` |
| `control` | RunObservation | Plain dump run |
| `runs[]` | RunObservation | At least 1 for M1, at least 2 identical-input runs for M2 |
| `status` | enum | `PASS`, `FAIL`, `UNKNOWN` |
| `notes` | string | Failing stage for FAIL |

### RunObservation

| Field | Type | Rule |
| --- | --- | --- |
| `pid`, `started`, `finished` | | |
| `monitor_lines[]` | string | File-monitor lines for the patched paths |
| `screenshots[]`, `log_excerpt[]` | paths, strings | |
| `memory_reads[]` | `{address, bytes_hex}` | For M2 |
| `observed_effect` | string | Human-recorded; must be non-empty for PASS |
| `crash_or_load_error` | bool | |

State transitions: `UNKNOWN` -> `PASS` only when every run has `crash_or_load_error == false`, observed effect matches prediction (M2: in both runs); any run failing -> `FAIL`; incomplete evidence stays `UNKNOWN`.

## ResearchFinding

Record `contracts/finding-record.schema.json`, mirrored in `docs/findings/*.md`.

| Field | Type | Rule |
| --- | --- | --- |
| `id`, `structure` | string | e.g. `iga-v4.header.flags_packed`, `level.entity.transform.x` |
| `location` | `{file_pattern, offset, length}` | |
| `type`, `endian` | string | Endian may be `unknown` |
| `meaning` | string | |
| `evidence[]` | `{experiment_id or probe, summary}` | Non-empty for LIKELY and CONFIRMED |
| `confidence` | enum | `CONFIRMED`, `LIKELY`, `UNKNOWN` |
| `editable` | bool | Must be false unless `confidence == CONFIRMED` (FR-013) |

Transitions: `UNKNOWN` -> `LIKELY` with at least two independent concordant observations; `LIKELY` -> `CONFIRMED` only through an Experiment with status `PASS` referencing the finding; any contradicting experiment -> back to `UNKNOWN` with the contradiction recorded.

## ValidationGate

| Field | Type | Rule |
| --- | --- | --- |
| `name` | enum | `M0`, `M1`, `M2`, `M3`, `M4A`, `M4B`, `M5` |
| `status` | enum | `PASS`, `FAIL`, `UNKNOWN` |
| `prerequisites` | gate names | M1 requires M0; M2 requires M1; editor work requires M1 and M2 |
| `evidence[]` | experiment ids | Non-empty for PASS |
| `validated_on` | date | |

Stored as `docs/m<N>-status.json` (M0 already exists); `dolphin_status` reads M0, the CLI `ssa-archive gates` reads all.
