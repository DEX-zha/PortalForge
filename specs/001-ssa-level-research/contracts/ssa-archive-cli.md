# Contract: `ssa-archive` CLI

Location: `tools/ssa-archive/cli.mjs`, invoked as `node cli.mjs <command> [options]`. Every command supports `--json` (machine output on stdout, one JSON document) and defaults to a human-readable summary. Errors go to stderr. Paths in output are absolute; paths inside descriptors use forward slashes.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success; for `verify`, archive VALID |
| 1 | Validation failure or experiment FAIL (report produced) |
| 2 | Unsupported input (wrong game id, IGA version != 4, unknown mode) |
| 3 | Usage or I/O error (missing file, dump not readable) |

## Commands

### `identify --game <wbfs>`

Reads the disc header through DolphinTool. Never writes the dump.

```json
{"game_id":"SSPP52","region":"PAL","revision":1,"internal_name":"Skylanders Spyro's Adventure","supported":true,"file_count":309}
```

### `disc-list --game <wbfs> [--filter <regex>]`

Lists DATA partition files; `--filter level/.*\.arc$`.

### `disc-extract --game <wbfs> --path <disc path> --out <dir>`

Extracts one disc file (read-only on the dump). Output: `{disc_path, file, size, sha256}`.

### `info <archive>`

Header and summary (FR-003).

```json
{"file":"...","size":52733200,"sha256":"...","version":4,"count":477,"name_table":{"offset":52682752,"size":50448},
 "header_words":[...12 ints...],"compression":{"NONE":477,"LZMA_CHUNKED":0},"alignment":2048,"hashes_sorted":true}
```

### `list <archive>`

One row per entry: `index, name, hash, start, size, stored_size, mode, compression, chunk_table_index`.

### `extract <archive> --out <workspace dir> [--decode]`

Writes stored entry bytes and `manifest.json` (schema `workspace-manifest.schema.json`). `--decode` additionally writes decompressed copies when the chunk semantics are CONFIRMED; otherwise reports `decoded: false` per entry instead of guessing.

### `verify <archive|workspace>`

Structural validation (FR-005, FR-006). Output `ValidationReport`; exit 1 when INVALID.

```json
{"status":"INVALID","failures":[{"offset":720,"field":"entries[0].start","actual":2050,"expected":"multiple of 2048","reason":"MISALIGNED_ENTRY"}]}
```

Failure reasons: `BAD_MAGIC`, `UNSUPPORTED_VERSION`, `COUNT_MISMATCH`, `HASHES_NOT_SORTED`, `LOOKUP_WORDS_MISMATCH` (header word 0x10 must equal `0xFFFFFFFF / count` and word 0x14 the maximum interpolation probe distance of the sorted hashes), `MISALIGNED_ENTRY`, `ENTRY_OVERLAP`, `ENTRY_OUT_OF_BOUNDS`, `NAME_TABLE_BOUNDS`, `NAME_OFFSET_OUT_OF_RANGE`, `UNSUPPORTED_MODE`, `CHUNK_TABLE_OUT_OF_RANGE`, `WORKSPACE_ENTRY_HASH_MISMATCH`.

### `rebuild <workspace dir> --out <archive> [--replace <index>=<file>]... [--layout preserve|sequential] [--pad <0x800 blocks>] [--reencode-all]`

Byte-preserving rebuild by default; replaced entries are re-encoded only if the original entry was compressed and re-encoding is CONFIRMED to decode identically. `--layout sequential` relays entries in table order, `--pad` inserts zero blocks before the name table and `--reencode-all` re-encodes every LZMA entry: three semantically equivalent, byte-different variants used to make the in-game M1 proof meaningful (a byte-identical rebuild is indistinguishable from the original for the file monitor). Runs `verify` on the output and `diff` against the source. Output: `RebuiltArchive` including `diff`; exit 1 if INVALID or `unclassified_bytes > 0`.

### `diff <original> <rebuilt>`

`DiffReport` (FR-007): regions with `offset, length, old_hex, new_hex, class` and `size_delta`.

### `patch --experiment <id> --game <wbfs> --replace <disc path>=<file>... --out <patch dir> [--force]`

Generates `riivolution/<id>.xml`, `launch.json` (via `buildDescriptor`), and `patch.json` with `expected_monitor_sizes`. Never copies files identical to the original under `.local/samples` unless `--force` is given (an experiment may deliberately serve an identical rebuild).

### `scan floats <file> [--range min max] [--vector 2|3|4|16] [--endian le|be|both]`

FR-010. Output rows: `offset, endian, values[], score`.

### `scan strings <file> [--min 6] [--filter <regex>]`

Printable runs with offsets, to locate `.igz` object type names.

### `scan identifiers <file> [--min 4] [--limit 200]`

Histogram of identifier-like tokens (type names such as `tfbActorInfo`, `AbstractPlacement`) to catalogue the vocabulary of a decoded IGZ.

`--range` takes one string: `--range "-50000 50000"` or `--range=-50000,50000`.

### `bindiff <a> <b> [--context 16]`

Raw byte differences with context; used for comparative analysis (R11).

### `experiment explore [--script <json>] [--figure <.sky>] [--label <name>] [--game <wbfs|descriptor>]`

Boots the game and replays an input script with a labelled screenshot per `shot` step; used to record the level-entry script. Writes `.local/dolphin-evidence/<label>.json`.

Input script steps: `{"press":"A","frames":3}`, `{"nunchuk":{"StickX":1,"StickY":0},"frames":60}`, `{"wait":<seconds>}`, `{"wait_monitor":"<disc path>","timeout":<s>,"required":false}`, `{"shot":"<label>"}`, `{"figure":"@figure","slot":1}`, `{"save_state":<1..10>}`.

### `experiment m1 --archive <disc path> [--variant identical|sequential|reencode] [--figure <.sky>] [--script <json>] [--skip-control]`

Runs the M1 round-trip through the MCP: extract, rebuild (variant, default `sequential` for `.arc`, `reencode` for `.bld`), verify, diff, patch, control boot, patched boot, scripted level entry, consumption proof from the file monitor, captures, clean stop. Writes `.local/dolphin-evidence/experiments/<id>.json` and prints its `status`. Exit 1 on FAIL or UNKNOWN, 2 when M0 is not PASS.

### `experiment m2 --archive <disc path> --entry <index> --offset <n> --type f32le|f32be|u32le|u32be|u16le|u16be|u8 --value <v> --predict "<text>" [--finding <id>] [--repeat 2] [--watch <address>]... [--figure] [--script] [--skip-control]`

Applies one mutation (decoding the entry when LZMA-chunked), rebuilds re-encoding only that entry, patches, runs the control and `--repeat` patched runs with the same inputs, reads the watched addresses, captures screenshots. The record is written with `status: UNKNOWN`; the observed effect is a human judgement.

### `experiment live-probe [--pattern <hex>]... [--poke match:<i>:<offset>=<value>[=<wait>]]... [--save-slot n] [--figure] [--script] [--label]`

Boots the plain dump, enters the level, searches MEM1/MEM2 for byte patterns copied from a decoded IGZ, writes a float at a found address, keeps before/after screenshots and optionally saves a native state.

### `experiment ram-diff [--save-slot 6] --figure <.sky> [--label]`

Boots, loads the figure, restores the native state of the level start, snapshots MEM1, moves the character with the Nunchuk, snapshots again, moves back, snapshots a third time. Reports float triples that changed on the move and reversed on the way back (`candidates`), i.e. live positions; used to locate the player position and then match it against level data.

### `experiment m2-judge --id <experiment id> --run <n> --observed "<text>" --match yes|no`

Records the observation for one run and re-evaluates the M2 rule: PASS only when every run has no crash or load error and matches the prediction (FR-012, SC-004); otherwise FAIL and the finding stays unconfirmed.

### `findings list [--category <c>] | show <id> | validate | render | editable | promote <id> --to LIKELY|CONFIRMED (--experiment <id> | --probe <name>) --summary "<text>"`

Finding records (`docs/findings/records/*.json`, schema `finding-record.schema.json`). `render` regenerates `docs/findings/<category>.md` and `docs/iga-v4.md`. `editable` lists only CONFIRMED findings flagged editable; `promote` enforces the confidence state machine (two independent observations for LIKELY; a PASS experiment referencing the finding for CONFIRMED).

### `gates`

Prints `docs/m*-status.json` as a table; `--json` returns the array of `ValidationGate`.

## Non-goals of this contract

No command edits level properties, creates objects, renders geometry or writes to the WBFS. Commands that would expose UNKNOWN findings as editable do not exist in this feature.
