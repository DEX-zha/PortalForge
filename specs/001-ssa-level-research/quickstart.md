# Quickstart: SSA Level Research validation

Runnable scenarios that prove the feature end to end. Commands are given from the repository root on the Windows workstation. Details of outputs are in [contracts/ssa-archive-cli.md](contracts/ssa-archive-cli.md) and [data-model.md](data-model.md).

## Prerequisites

- M0 PASS: `docs/m0-status.json` says `PASS`; `cd tools/dolphin-mcp; npm test; npm run smoke` succeed.
- Node.js 24 on PATH; `DolphinTool.exe` in the user's Dolphin 2606a folder.
- `.local/dolphin-config.json` points to the SSA WBFS (SSPP52, PAL, rev 1). The dump is never written.
- A Skylander figure file (`Sonic Boom.sky`) for level entry.
- Interactive Windows desktop (native Dolphin UI automation).

```powershell
cd tools/ssa-archive
npm ci --ignore-scripts
npm test                       # synthetic tests always run; fixture tests skip until samples exist
```

## Scenario 1: identify and inspect (FR-001 to FR-003)

```powershell
node cli.mjs identify --game "<wbfs>" --json
node cli.mjs disc-list --game "<wbfs>" --filter "level/.*\.(arc|bld)$"
node cli.mjs disc-extract --game "<wbfs>" --path level/Level_027_Tutorial.arc --out ../../.local/samples
node cli.mjs info ../../.local/samples/DATA/files/level/Level_027_Tutorial.arc --json
node cli.mjs list ../../.local/samples/DATA/files/level/Level_027_Tutorial.arc
```

Expected: `game_id` `SSPP52`, `supported: true`; `info` reports version 4, 477 entries, `hashes_sorted: true`, `compression.NONE == 477`, alignment 2048.

## Scenario 2: extract, verify, rebuild, diff (FR-004 to FR-007, SC-003)

```powershell
node cli.mjs extract ../../.local/samples/DATA/files/level/Level_027_Tutorial.arc --out ../../.local/workspaces/tutorial-arc
node cli.mjs verify ../../.local/workspaces/tutorial-arc
node cli.mjs rebuild ../../.local/workspaces/tutorial-arc --out ../../.local/workspaces/tutorial-arc/rebuilt.arc --json
node cli.mjs diff ../../.local/samples/DATA/files/level/Level_027_Tutorial.arc ../../.local/workspaces/tutorial-arc/rebuilt.arc
```

Expected: `verify` exit 0 and `VALID`; rebuilt `.arc` byte-identical (`regions: []`, `size_delta: 0`) or every region classified (`unclassified_bytes: 0`). Repeat with `Level_027_Tutorial.bld`; expected byte-identical with the byte-preserving strategy.

Negative check: truncate a copy of an archive by 1000 bytes and run `verify`; expected exit 1 with `NAME_TABLE_BOUNDS` naming the offset, actual and expected values.

## Scenario 3: M1 round-trip in game (FR-008, FR-009, SC-002)

```powershell
node cli.mjs experiment explore --figure "<Sonic Boom.sky>" --label explore   # once, to record/adjust the entry script
node cli.mjs experiment m1 --archive level/Level_027_Tutorial.arc --figure "<Sonic Boom.sky>" --json   # variant sequential (+0x800 padding)
node cli.mjs experiment m1 --archive level/Level_027_Tutorial.bld --figure "<Sonic Boom.sky>" --json   # variant reencode (every LZMA entry re-encoded)
```

Each run: control boot of the plain dump, patched boot with the rebuilt archive, figure load at the title screen, tutorial entry via `src/experiments/input-scripts/level-027-entry.json` (strap, Activision, title, autosave notice, Choose Play, Pick Game Slot, intro cinematic, Hugo dialogues, Skylander prompt; `Plus` pauses the game and is never used), proof of consumption (the file-monitor size line for the replaced path must show the rebuilt size, which differs from the original because the variants are byte-different by design), screenshots, logs, clean stop. Expected: `status: PASS`, `crash_or_load_error: false`, record written under `.local/dolphin-evidence/experiments/`. A byte-identical variant yields `UNKNOWN` on purpose: the monitor cannot distinguish it. M1 is PASS only when both records are PASS; then `docs/m1-status.json` is written by hand with the experiment ids.

## Scenario 4: research utilities (FR-010, R11)

```powershell
node cli.mjs extract ../../.local/samples/DATA/files/level/Level_027_Tutorial.bld --out ../../.local/workspaces/tutorial-bld --decode
node cli.mjs scan strings ../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded --min 8
node cli.mjs scan floats ../../.local/workspaces/tutorial-bld/entries/3-level.bld.decoded --vector 3 --range -20000 20000 --endian both
node cli.mjs bindiff <challenge_000 decoded> <challenge_001 decoded>
```

Expected: `--decode` produces decompressed entries only once chunk semantics are CONFIRMED (otherwise `decoded: false` with the reason); scanners output offsets and candidate triples for manual review and live-memory checks through the MCP (`dolphin_read_float`, `dolphin_write_float`).

## Scenario 4b: locate a live position and match it to level data (R11)

```powershell
node cli.mjs experiment live-probe --figure "<Sonic Boom.sky>" --save-slot 6 --label live-probe1   # once: saves the tutorial-start state
node cli.mjs experiment ram-diff --figure "<Sonic Boom.sky>" --save-slot 6 --label ram-diff2
node research-probes\probe-igz-near.mjs <x> <y> <z> 3        # IGZ triples near the live position, with owner object type
```

Expected: `ram-diff` lists reversible world-scale triples (the Skylander position; `ram-diff2` found (91.34, 10.55, 44.22)); the near-probe lists candidate records with their owner type (ScriptSet, tfbPhysicsModel, ScriptSetReference boxes). Screen a candidate with `experiment m2 --repeat 1 --skip-control` (5 min) before the formal run.

## Scenario 5: M2 controlled mutation (FR-011, FR-012, SC-004)

```powershell
node cli.mjs experiment m2 --archive level/Level_027_Tutorial.bld --entry 3 --offset <n> --type f32be --value <x+100> --predict "object <name> moves +100 on X" --repeat 2 --json
```

Expected: two runs with identical inputs, both `observed_effect` matching the prediction, `status: PASS`; the referenced finding moves to CONFIRMED with `editable: true` only after this. Any mismatch leaves the finding LIKELY or UNKNOWN and `status: FAIL`.

## Scenario 6: gates and documentation (FR-013, FR-015, SC-006, SC-007)

```powershell
node cli.mjs gates
```

Expected: M0 PASS, M1/M2 statuses from their status files, M3 to M5 UNKNOWN. `docs/format/iga-v4.md` and `docs/findings/*.md` contain one record per field with Offset, Type, Endian, Meaning, Evidence, Confidence; no UNKNOWN finding is exposed by any CLI command as editable.
