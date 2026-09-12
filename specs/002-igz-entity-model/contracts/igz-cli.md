# Contract: `ssa-archive igz` commands and `experiment m3`

All commands accept `--json`; exit codes as in feature 001 (0 ok, 1 validation/experiment failure, 2 unsupported, 3 usage).

### `igz sections <decoded file>`
Header words, section table, section-0 second header. Fails with exit 2 unless magic `IGZ\x01` and version 5.

### `igz types <decoded file>`
Type index, name (may be empty) and size hint; `--histogram` adds object counts per type.

### `igz objects <decoded file> [--type <name>] [--limit n] [--out <graph.json>]`
Enumerates objects and unparsed regions; prints the accounting line `objects=… unparsed=… padding=… total=…` (SC-001). `--out` writes the ObjectGraph JSON (schema `object-graph.schema.json`).

### `igz show <decoded file> <offset>`
One object with resolved fields: strings (`section2 + v`, 0 = null), object references, flagged references, floats and small integers.

### `igz near <decoded file> <x> <y> <z> [--tol 3]`
Float triples near a position with owner object and field offset; excludes feet-multiple dimensions when `--no-dimensions`.

### `igz match <decoded file> --address <ram address> [--base 0x80DBC020]` or `--pattern <hex>`
Maps a live RAM address or byte pattern to `(object, field)`.

### `igz fields <decoded file> [--limit n]`
Per-type statistics of position-like float triples (which field offsets carry world-scale triples, how many are box minima).

### `igz clone <decoded file> <object offset> --finding <id> [--set <hex offset>[:f32be|u32be|u16be|u8]=<value>]... --out <decoded file> [--plan <plan.json>] [--append-to-list]`
Builds and validates a DuplicationPlan (schema `duplication-plan.schema.json`): copies the object to the end of the object section, applies size-preserving edits, assigns a fresh id, shifts later sections and the section table, optionally writes the clone's offset into a null slot of the section-1 list (`--append-to-list`, semantics UNKNOWN). Refuses when the finding is not CONFIRMED (exit 1); exit 1 also when the re-parsed graph fails. The output decoded file feeds `experiment m3` or `rebuild --replace <entry>=<file>` (chunk-count growth supported).

### `experiment m3 --archive <disc path> --entry <i> --plan <plan.json> [--file <cloned decoded file>] --predict "<text>" [--repeat 2] [--skip-control] [--figure] [--script]`
Rebuilds with the cloned entry (re-encoding only that entry, growing the chunk table if needed), patches, runs the control and `--repeat` identical patched runs, records `inputs.duplication`; judged with `experiment m2-judge` (PASS needs every run to match and at least two repeats). `docs/m3-status.json` is written by hand after judgement.
