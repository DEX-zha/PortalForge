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

### `igz clone <workspace dir> --object <offset> --finding <id> --set <field>=<value>... --out <decoded file> [--plan <plan.json>]`
Builds and validates a DuplicationPlan (schema `duplication-plan.schema.json`); refuses when the finding is not CONFIRMED or when validation fails (exit 1). Output is a new decoded `level.bld` to feed `rebuild --replace <entry>=<file>` (chunk-count growth supported after this feature).

### `experiment m3 --archive <disc path> --entry <i> --plan <plan.json> --predict "<text>" [--repeat 2] [--figure] [--script]`
Rebuilds with the cloned entry, patches, runs the control and two patched runs, records `inputs.duplication`; judged with `experiment m2-judge` (same rule: PASS needs every run to match and at least two repeats). Writes `docs/m3-status.json` only by hand after judgement.
