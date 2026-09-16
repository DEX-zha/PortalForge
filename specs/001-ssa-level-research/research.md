# Phase 0 Research: SSA Level Research

Date: 2026-09-12. Evidence files referenced below live in `.local/` (not committed). Confidence labels follow FR-013: **CONFIRMED** (observed on local data or executed), **LIKELY** (concordant sources, not yet exercised), **UNKNOWN** (hypothesis).

## R1. Toolkit language and runtime

- **Decision**: Node.js 24 (ES modules) for the whole research toolkit, tests with `node --test`.
- **Rationale**: It is the only runtime installed (no `python`, `py`, `uv` or `dotnet` on PATH; verified 2026-09-12). The Dolphin MCP, its tests and the M0 proof are already Node code, so experiment drivers reuse the MCP client, `buildDescriptor`, evidence paths and the chunked `frame_advance` pattern without a second toolchain. Binary parsing needs only `Buffer`.
- **Alternatives considered**: Python (original description's recommendation for research scripts) rejected for now because it is not installed and would split the automation stack; C#/.NET (recommended for the later editor) rejected for this feature because no editor is in scope and .NET is absent. Migration remains possible once formats are CONFIRMED, since contracts are JSON and file-based.

## R2. IGA version 4 container layout

Sources: header words of five local archives (`character/001_Gryphon.arc`, `character/001_Gryphon.bld`, `level/Level_000_Mining.bld`, `level/Level_027_Tutorial.arc`, `level/Level_027_Tutorial.bld`), parsed with the probe scripts `tools/ssa-archive/research-probes/probe-iga-header.mjs` and `probe-iga-contents.mjs` (run from that folder once the samples are extracted); offsets cross-checked against the community reader [igArchiveExtractor](https://github.com/NefariousTechSupport/igArchiveExtractor) (`IGAE_Globals.cs` table for `SkylandersSpyrosAdventureWii = 0x04`, `IGAE_File.cs`). All multi-byte values are **little-endian** despite the Wii's big-endian CPU (CONFIRMED: magic bytes `49 47 41 1A`, version `04 00 00 00`).

| Offset | Type | Meaning | Confidence | Evidence |
| --- | --- | --- | --- | --- |
| 0x00 | u32 | Magic `0x1A414749` ("IGA\x1A") | CONFIRMED | all samples |
| 0x04 | u32 | Version = 4 | CONFIRMED | all samples |
| 0x08 | u32 | Size of the table area after the fixed header: equals `count * 16` for uncompressed `.arc` (hash + 12-byte entries); larger for `.bld` (adds chunk tables: 0xCE, 0x692, 0x7E0) | LIKELY | 0x2A0 = 42*16, 0x1DD0 = 477*16 |
| 0x0C | u32 | Entry count | CONFIRMED | names and hashes resolve for every entry |
| 0x10 | u32 | Packed per-entry flags, 3 bits per entry pattern (`0x24924924` for 7 compressed entries, `0x06186186` for 42 uncompressed) ; igArchiveExtractor reads "alignment" here but hardcodes 0x800 for v4 | UNKNOWN | decode by correlating with modes |
| 0x14 | u32 | Unknown (2 for four samples, 14 for the 477-entry arc) | UNKNOWN | |
| 0x18 | u32 | Name table location (absolute) | CONFIRMED | `location + length == file size` on all samples |
| 0x1C | u32 | Name table length | CONFIRMED | idem |
| 0x20 | u32 | 0 | UNKNOWN | |
| 0x24 | u32 | `.bld` only: 0x29, 0x30B, 0x3B2, grows with archive size; 0 in `.arc` | UNKNOWN | probably total chunk count |
| 0x28 | u32 | `.bld` only: 0xC; 0 in `.arc` | UNKNOWN | |
| 0x2C | u32 | 0 | UNKNOWN | |
| 0x30 | u32[count] | Name hashes, strictly ascending | CONFIRMED sorted; algorithm UNKNOWN | ascending on all samples |
| 0x30+4n | {u32 start, u32 size, u32 mode}[count] | Entry table; `start` absolute, `size` uncompressed, `mode` high byte = compression (0xFF none, 0x10 LZMA on v4 per igArchiveExtractor's remap 0x10 to 0x20), low 24 bits = chunk-table index | CONFIRMED start/size for uncompressed entries; mode semantics LIKELY | names, starts, sizes consistent; data ends 0x800-aligned just before the name table |
| after entries | u16[] | Chunk table for compressed entries: ascending values with bit 15 set (`0x8000, 0x8008, 0x800B ...`) | UNKNOWN semantics (LIKELY cumulative compressed-chunk offsets in 0x800 units plus a flag) | `.bld` samples |
| entries | bytes | Entry data, each start aligned to 0x800 | CONFIRMED | `start % 0x800 == 0` for all 533 entries checked |
| name table | u32[count] offsets then NUL-terminated strings | Names are full build paths (`c:/tfb/build/wii/...`) or plain names (`FRENCH.pak`, `level.bld`) | CONFIRMED | |

Resolution plan for UNKNOWN rows: implement the reader, decode every chunk table by decompressing `.bld` entries with each candidate interpretation, and correlate 0x10/0x24/0x28 with entry counts, chunk counts and modes across all 153 level archives. Each resolved field moves to `docs/format/iga-v4.md` with its evidence.

## R3. Compression

- **Findings**: Every `.arc` sample is fully uncompressed (mode `0xFFFFFFFF`, 519 of 519 entries). Every `.bld` entry uses mode high byte `0x10`. igArchiveExtractor decodes v4 entries as LZMA in 0x8000-byte chunks, each chunk prefixed by a 5-byte LZMA properties header (`0x5D` + dictionary size), chunk sizes stored as u16 for versions up to 0x0B, chunks aligned to 0x800 (LIKELY, from the reader's code, not yet executed locally).
- **Decision**: M1 rebuilds never re-encode: unchanged entries are copied byte for byte, including their compressed chunks and chunk tables. Re-encoding is only needed for the single entry mutated in M2, and only if that entry is compressed.
- **Rationale**: Removes encoder-parity risk from M1 and makes a byte-identical rebuild the expected outcome for `.arc`; keeps the LZMA encoder a contained, testable component exercised first by a decode-encode-decode identity test.
- **Alternatives considered**: Storing mutated entries uncompressed (mode 0xFF) inside a `.bld` is a cheap fallback if the game accepts mixed modes; it is a hypothesis to test in M1b, not assumed.

## R4. Name hashes

- **Decision**: Copy hash values verbatim from the original archive; keep entry order and hash order identical. The hash algorithm is not needed for M1 or M2 (no new or renamed entries) and is tracked as an UNKNOWN finding with a later task (brute-force common 32-bit hashes such as FNV-1/1a, CRC32, djb2 against the known name/hash pairs).
- **Rationale**: 533 known name/hash pairs are available locally, so the algorithm can be recovered offline when M3 (duplication) needs it.

## R5. Where level data lives

- **Findings**: `Level_027_Tutorial.arc` contains 476 encoded sounds (`.wav.hz.wav.enc`) and 1 texture `.igz`; `character/001_Gryphon.arc` contains sounds and 15 texture `.igz` (strings `igObjectList`, `igTextureAttr2`, `igImage2` visible). Every `.bld` sample contains six language `.pak` files and one nested `level.bld`, all LZMA-compressed. The community thread on Giants reports `.pak` and nested `.bld` entries contain `.igz` objects.
- **Decision**: Treat the nested `level.bld` inside `level/<Level>.bld` as the primary candidate for world data (LIKELY). M1a targets the `.arc` (simplest), M1b the `.bld`; M2 candidates are searched in the decoded nested `level.bld`, with `permanent/global.arc` (500 MB, uncompressed) as a secondary place to look for uncompressed world data.

## R6. M1 candidate and rebuild strategy

- **Decision**: `level/Level_027_Tutorial` (the first playable level, reached in the earlier M0 session with Sonic Boom) is the M1 target: `.arc` first (M1a), `.bld` second (M1b). Success criterion per FR-008: patched boot, tutorial entered, expected assets present (voice lines audible is not checkable; use screenshots, file-monitor log lines and absence of crash), compared to a control run.
- **Rebuild algorithm**: parse original -> workspace manifest capturing header words, hash table, entry table, chunk tables and raw entry bytes -> writer emits header, tables, entries at the original alignment and the name table; any unknown header word is emitted verbatim from the manifest. Diff must classify 100 % of byte differences (SC-003); for `.arc` the expected diff is empty.
- **Alternatives considered**: Using igArchiveExtractor to rebuild was rejected: it is discontinued, .NET-only, and its matrix explicitly lists no rebuild support for SSA Wii.

## R7. LZMA codec

- **Decision**: Evaluate `lzma-purejs` (pure JS encoder + decoder, streaming) first, `lzma1` second; pin the exact version; wrap behind `src/iga/chunks.mjs` so the codec can be swapped. Acceptance: decode all chunks of `001_Gryphon.bld` and re-encode to a stream that decodes identically; compression ratio parity is not required.
- **Rationale**: No native build toolchain on the workstation (rules out `lzma-native`); raw LZMA1 with explicit 5-byte properties is exactly what the community reader handles.

## R8. Disc identification and extraction

- **Decision**: Wrap the existing `DolphinTool.exe` (`header -i`, `extract -i -g -l`, `extract -i -g -s <path> -o <dir>`). It read `Game ID: SSPP52`, `Revision: 1`, `Region: PAL`, listed 309 DATA files and extracted the samples without writing to the dump.
- **Alternatives considered**: A JavaScript WBFS/Wii filesystem reader (Wii partition decryption, FST parsing) rejected as unnecessary work for this feature.

## R9. Patch workflow

- **Decision**: Patch workspaces contain only replacement files plus `riivolution/<experiment>.xml` and a Dolphin game-mod `launch.json`, generated through `buildDescriptor` from `tools/dolphin-mcp/runtime.mjs`, which writes forward-slash paths.
- **Rationale (CONFIRMED)**: Dolphin's `SplitPath` splits the XML path only on `/` and `:`; backslash descriptor paths made the patch root `C:` and every relative external file silently missing. Fixed and unit-tested during M0; documented in `docs/mcp/dolphin-mcp.md`.
- **Proof of consumption**: never the boot alone. For each patched file, compare the Dolphin file-monitor size line against the control run, or read a known changed value in memory.

## R10. In-game acceptance procedure

- **Decision**: Experiment drivers use the MCP: control boot of the plain dump, patched boot, `dolphin_load_figure`, scripted inputs to enter the tutorial (sequence to be recorded once and stored as a replayable input script), `dolphin_screenshot`, `dolphin_logs`, `dolphin_save_state` at the level entry to shorten repeats, `dolphin_stop`. Waits use `frame_advance` in chunks of 120 frames (15 s bound). Each run writes an experiment record (see data model) and exits non-zero on failure.
- **Known limits**: no exact frame stepping; bridge silent during native pause; UI tools need the interactive desktop and French/English Dolphin UI.

## R11. M2 approach

- **Decision**: Comparative analysis before mutation. (1) Decode the nested `level.bld` of two similar levels (e.g. two `Challenge_Level_*`) and of the tutorial; (2) run the float/vector scanner (FR-010) for plausible position triples in world ranges, both byte orders; (3) validate a candidate live first: read the value through the MCP in memory, write a changed value with `dolphin_write_float`, observe whether an object moves; (4) only then mutate the archive value, rebuild, patch, and run the experiment twice (SC-004).
- **Rationale**: Live memory writes are reversible and fast, so they filter candidates before any archive rebuild; the archive mutation remains the authoritative M2 proof.

## R12. Documentation and evidence format

- **Decision**: `docs/format/iga-v4.md` and `docs/findings/*.md` use the field record `Offset / Type / Endian / Meaning / Evidence / Confidence` from the original description; machine-readable findings and experiments follow the JSON schemas in `contracts/`. UNKNOWN findings are never exposed by the CLI as editable properties (FR-013).

## R13. Testing strategy

- Synthetic archives built in tests exercise header, tables, alignment, name table, verify failures (overlap, misalignment, bad magic, truncated name table) and diff classification without game data.
- Fixture tests against `.local/samples` (skipped when absent) assert the CONFIRMED rows of R2 and the byte-identical `.arc` round-trip.
- Experiment drivers are the integration tests; their JSON records are the evidence for M1 and M2.

## R14. Rejected alternatives summary

| Alternative | Reason rejected |
| --- | --- |
| Python research scripts | Not installed; would split automation from the Node MCP |
| .NET port or reuse of igArchiveExtractor | Discontinued, no SSA Wii rebuild, .NET absent |
| Re-encoding every entry on rebuild | Encoder parity risk inside the M1 gate |
| RAM marker search for patch proof | Invalidated during M0: only parsed data persists |
| Custom WBFS reader | DolphinTool already covers identification and extraction |
