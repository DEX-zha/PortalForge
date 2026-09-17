# Documentation and code consistency audit — 2026-09-17–18

Scope: README, documentation entry points, the seven feature specs and their plans/tasks/contracts, generated
finding documentation, capability derivation and comments describing the current editor/runtime behavior.
Historical experiment narratives remain historical; they are not rewritten into new proof claims.

## Corrections

| Inconsistency | Correction and source of truth |
|---|---|
| A CONFIRMED direct-entry row also confirmed transforms | Independent transform lookup from the finding's explicit `confirmed_levels`, wired through catalogue, opening and file-session fallback. Regression covers missing scope, other levels and demotion. |
| Level tab said additions were tutorial-only | General resident additions are available and explicitly experimental; individual cards retain recipe evidence and source restrictions. No blanket source confirmation. |
| 76 levels all claimed to open | 76 archive entries, 75 scenes with placements; Title is a menu archive without a placement class. |
| Draft feature statuses and a blocked Mining proof | Current status index for all seven specs; 003 T053/T054 cite the existing two Mining transform boots. Older design limits are labelled historical. |
| Family promotion proposed despite constitution 1.2.0 | 007 V02 closed as superseded, V03 narrowed to coverage absent from R1, V04 retains exact-source review. No new recipe or gate promoted. |
| Catalogue still listed as future import work | 004 T010 and 007 C01 point to delivered phase P. Dependency closure and cross-level import remain open. |
| Eight-source gating and pre-existing snapshot presented as current API | 007 contract documents experimental additions, live measurement, 590 guard, 59-row table and the library routes. 005 remains the confirmed historical baseline. |
| Atomic snapshot / cache / capacity comments contradicted code | Chunked reads are not atomic; catalogue opening verifies digests; the guard and compiled capacity are distinct. Tutorial type indices are labelled per-file examples. |
| Dead snapshot helper | Removed `snapshotFolder`, with no call sites in source, tests, probes or documentation. Other export-scan candidates are used locally and retained. Research probes remain reproducible evidence. |
| Format generation silently skipped its introduction | `findings render` now resolves `docs/format/iga-v4.intro.md` and regenerates the adjacent document. A regression starts with stale output and checks the replacement. |
| README setup and proof claims | Root-relative PowerShell commands, catalogue workflow, scoped transform/addition claims, distinct M4A/M4B/M5, and creation separated from combat/collection semantics. |

The [specification status](../../specs/README.md) maps delivered work and remaining tasks. In particular, the
reserved MEM2 table, activation edits, import, complete model-less campaigns, launch census integration and
cross-level evidence badges remain open. This audit does not implement those research features.

## Verification

- SSA: 375 tests passed, none skipped; includes explicit transform-scope and relocated-format-generator regressions.
- Dolphin MCP: 6 tests passed.
- ESLint and Prettier checks passed; `git diff --check` passed.
- Documentation check: 243 relative links resolve, 113 JSON files parse, fixed documentation paths present.
- Repository content check: 474 tracked files, 9 authorized illustrations, no game data, no file over 2 MB.
- Findings rendered from JSON and the maintained introduction; no generated Markdown edited by hand.
- Catalogue browser scenario: `.local/object-workflow/browser-1789682045715/result.json`, zero browser exceptions.
- Multi-level browser scenario: `.local/level-check/browser-1789682717427/result.json`, PASS for Mining,
  Challenge and tutorial switches, with updated capability expectations.
- Export/reference scan found the unused snapshot helper; locally used helpers and reproducibility probes were retained.

The user's full screenshot of Level_021_Sheep replaces the primary editor image. The catalogue capture comes
from an isolated Mining session. Three existing experimental frames were added, and all six game evidence
images are displayed whole in the README, with run identifiers and limits. Source PNGs were copied unchanged.
The [image provenance](../images/README.md) records their origins and SHA-256 hashes.
No new Dolphin experiment was run, no gate was advanced and the user's running editor was not restarted.
