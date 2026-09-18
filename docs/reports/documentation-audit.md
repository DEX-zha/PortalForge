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

## Follow-up: runtime reporting and merge preparation, 2026-09-18

The second pass traced the HTTP session lifecycle, save validation, live-table arrival, per-instance inspections,
family reports and their evidence pages. It also reviewed the explanatory claims against those code paths.

| Defect or overstatement | Correction |
|---|---|
| Asynchronous opening allowed conflicting edits/launches | Hold the old session lock until opening succeeds or fails; failed opening preserves the scene. A stale observation cannot release another operation's lock. |
| Primitive JSON bodies, string `discard`, unsupported verbs and asynchronous GET rejection | Validate object bodies and boolean discard; reject unsupported API methods; await the handlers inside the error boundary. |
| Save checks ignored a final partial word and counted changed words as bytes | Check trailing bytes, count actual differing bytes, and compare the written file with the complete validated buffer. |
| Missing final readings became failed creation or script removal | Distinguish observed creation, inconclusive inspection and explicit failure in reports and UI; file a verdict even when no sample succeeded. |
| One instance read failure discarded other results; rows could individually pass with shared pointers | Preserve per-row errors and successful readings; cross-check instance, actor and mutable-state ownership across rows. Sequential pointer reuse is inconclusive. |
| Live-table retry could replay creation after an uncertain bridge acknowledgement | Cache completed arrival and stop retrying after writing has started and failed. Measurement-only failures remain retryable. |
| Short snapshot reads could silently leave zero-filled memory | Require exact read lengths and MEM1 boundaries before accepting resident-section evidence. |
| Evidence page only understood tutorial batches and hid other captures | Resolve ordinary editor launches as well as legacy batches; display the full capture sequence and missing local records. |
| Docs omitted offsets from family keys, claimed continuous sampling and universal wrong-address safety | Match the actual hash inputs, bounded polling and runtime guard limitations. Separate creation from survival and inferred causes. |
| Generated format provenance excluded executable/memory analysis; CI missed its generated file | Correct the maintained introduction, regenerate, and include `docs/format/iga-v4.md` in the drift check. |

The new [knowledge map](../knowledge-map.md) connects claims, code, evidence and remaining uncertainty. The README,
documentation index, addition guide and feature 007 contract/plan point to the current behavior. The existing full
editor capture and nine authorized illustrations are retained; no synthetic or altered proof image was introduced.

Validation after these corrections:

- `npm test` at the root: 385 SSA tests and 6 MCP tests passed, none skipped. Ten new regression tests cover
  the concrete defects; existing instance-inspection tests gained partial-read and shared-pointer cases.
- `npm run lint`, `npm run format:check`, and `git diff --check`: passed.
- Findings: 83 valid records; all four gate files consistent with their existing evidence. No promotion.
- Documentation: 261 relative links resolve, 113 JSON files parse, fixed paths present.
- Content: 477 tracked/intended files, nine published images, no prohibited game data and no file over 2 MB.
- Catalogue browser: `.local/object-workflow/browser-1789718788934/result.json`, no browser errors.
- Multi-level browser: `.local/level-check/browser-1789718855055/result.json`, PASS.

These are local Windows checks, not a claim that the remote Linux/Windows and Node 22/24 CI matrix has run on
this diff. No new real-game boot was performed for the host-side fixes; the tutorial compiler remains byte-pinned
by its regression tests. Runtime experiments and pending research still have the scope stated in their findings.
Save plus sidecar is not crash-atomic, snapshots are not instantaneous, and experimental additions are not a
production guarantee for arbitrary game content. The changes are prepared for review; this audit does not merge main.
