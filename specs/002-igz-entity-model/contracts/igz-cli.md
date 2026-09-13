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

### `igz refs <decoded file> <object offset> [--depth n]`
Reverse references: every word of every section whose value resolves to the object under the known conventions (object-section-relative, absolute, flagged low bits, other-section-relative), with the referrer object and field; `--depth` follows referrers upward (owner chain).

### `igz containers <decoded file> [--type <name>] [--limit n]` / `igz members <decoded file> <object offset>`
Data-driven list decoding: `{count, capacity, pointer}` triples whose array resolves to object headers, and inline arrays of object offsets; `members` lists the containers holding one object.

### `igz relocation-probe <decoded file> --fixups <map.json> [--section N] [--probe template] [--out <report.json>]`
Static search for how the game encodes which words to rebase into pointers. Scores flat encodings (u32/u16 raw and cumulative-delta, LEB128, byte/u16 delta streams), sliding bitmaps, per-type templates and a structural model (type-consistent fixed fields + contiguous pointer arrays) against the ground-truth relocated-word set from `--fixups`. Result on the tutorial: no flat encoding exceeds ~2% recall, no fixup-section magic, structural model explains 76% — relocation is reflection-driven (per-type field descriptors), not a flat table.

### `igz fixups <decoded file> <resident section dump> [--base 0x80DBC020] [--regions <mem1.bin>,<mem2.bin>] [--section-address <i>=<addr>]... [--out <map.json>]`
Diffs the file against the resident copy of its object section (from `experiment ptr-scan --dimensions`) and classifies every rewritten word (pointer, class, id, string, code, zeroed, filled); reports which objects the loader visited and writes the pointer/id word lists used by `igz clone-entity`.

### `igz clone-entity <decoded file> <owner offset> --end <block end> --fixups <map.json> --finding <id> [--set <hex offset in block>[:type]=<value>]... --out <decoded file> [--plan <plan.json>] [--no-register] [--also-finding <id>]...`
Reachable duplication: copies the byte block `[owner, end)` (owner plus the children stored after it) to the end of the object section, rebases the pointers that stay inside the block, gives fresh ids to every id word of the copy, applies edits, then registers the copy as one more section-1 header-table entry, shifting the whole object area by 4 bytes and rebasing every pointer word of the fixup map (and the table itself). Refuses non-CONFIRMED findings; VALID only when the re-parsed graph has the expected object count, every original object is found at its shifted offset, the copy's pointers resolve like the source's and the header counts agree. `--also-finding` lists the findings the experiment record must reference for promotion.

### `igz pick-overwrite-target <decoded file> --end <block end> --type <n> --fixups <map.json>`
Ranks header-table records of type `<n>` whose blob (distance to the next table entry) can hold the clone block, by (external references into the blob, leftover), for in-place registration.

### `igz clone-entity ... --overwrite <hex target offset>`
In-place registration: overwrites an existing same-type header-table record with the clone block (rebasing block-internal pointers, zeroing the blob leftover, incrementing shared-target refcounts). The header table is not grown and no bytes move: the file length is unchanged and only the target blob and a few refcount words differ, so the game's per-type relocation walk processes the clone exactly as the sacrificed record. This is the registration path that avoids the global shift which desynchronised the load when the table was grown.

### `experiment ptr-scan --file <decoded file> --address <file offset|0x8... address>[,...] [--pattern <hex>]... [--save-slot 6] [--figure <.sky>] [--dimensions] [--no-dimensions] [--label]`
One boot from a native state: snapshots MEM1 (+MEM2 unless `--no-dimensions`), diffs the resident bytes of each target against the file, lists runtime referrers (in-section ones mapped to object/field, heap ones with 64 bytes of context), searches patterns; `--dimensions` dumps the resident object section for `igz fixups`. Report in `.local/dolphin-evidence/<label>.json`.

### `experiment m3 --archive <disc path> --entry <i> --plan <plan.json> [--file <cloned decoded file>] --predict "<text>" [--repeat 2] [--skip-control] [--figure] [--script] [--probe <hex>[:<header delta>[:<label>]]]...`
Rebuilds with the cloned entry (re-encoding only that entry, growing the chunk table if needed), patches, runs the control and `--repeat` identical patched runs, records `inputs.duplication`; judged with `experiment m2-judge` (PASS needs every run to match and at least two repeats). `--probe` searches MEM1 after each run for a pattern (e.g. the clone's position triple) and reads back the object header `delta` bytes before it: a header whose type word became a class pointer proves the loader visited the clone (`memory_reads` in the record). `docs/m3-status.json` is written by hand after judgement.
