# What is known, why it is known, and where to investigate

This is the reading map for the current implementation, dated 2026-09-18. It describes SSPP52 Rev 1 on Wii,
not every edition of Skylanders or every game using IGA/IGZ. The [specification index](../specs/README.md)
separates delivered features from planned research. Historical experiment notes describe the code and conditions
of their own runs; they are not blanket permissions for today's editor.

## Reading a claim

The authority for a finding is its JSON record in [findings/records](findings/records/), including confidence,
scope, observations and references. Generated Markdown is a readable projection, not a second editable database.
Run `node tools/ssa-archive/cli.mjs findings render` from the repository root after changing a record or the
maintained format introduction. CI checks both the findings directory and the generated IGA document.

**CONFIRMED** applies to the property or recipe and scope actually tested. **LIKELY** records an interpretation
or extension that lacks the required confirmation. **UNKNOWN** is unresolved. A passing unit test establishes
software behavior for its inputs; it cannot promote a game hypothesis. Runtime capability promotion requires
the experiment's evidence and the two identical boot rule, not just two successful tool invocations.

Follow the chain: claim → finding → experiment/run identifiers → input and patch identity → archive consumption
→ memory observations and captures → explicit verdict. A launch, a black frame, or the existence of an MCP tool
does not establish consumption. Dolphin's file-monitor size line or a memory read must distinguish the replacement
from the original. A screenshot demonstrates visible state at one moment; it does not prove pointer ownership,
collision, successful collection, or the number of instances returned by a factory.

Most raw evidence is deliberately local: `.local/dolphin-evidence/`, decoded workspaces, runtime maps and reports.
A fresh clone has methods, assertions, tests and selected [illustrations with provenance](images/README.md),
not the complete experimental dataset. Missing local evidence must be described as unavailable, never as a pass.

## Format and loader

| Subject | Established scope and reasoning | Starting point |
|---|---|---|
| IGA v4 container | Extract/rebuild identity and decode/re-encode checks exercise the directory, entry records and LZMA representation. Container success alone says nothing about a modified object's behavior. | [IGA format](format/iga-v4.md), M1 |
| Controlled edits | Size-preserving writes to identified fields were consumed and observed in game. An editable field needs its own confirmed finding. | [Level editing](format/igz-level-editing.md), M2 |
| Placement duplication | Replacing a same-size slot already visited by the loader can create a visible duplicate. This is replacement, not insertion or a general allocator. | `igz.placement.type104-record`, `level.prop.scriptset-placement`, M3 |
| Loader traversal | Count-bounded traversal is a LIKELY explanation of observed walk behavior and failed insertion experiments. The usable replacement recipe can be confirmed while the internal explanation remains provisional. | `igz.loader.head-span-count-walk` |
| Class indices | A type index belongs to a particular file's class table. Tutorial indices are examples, not universal type IDs. Script parsing detects the class/layout per file. | `src/igz/script.mjs`, `src/editor/script-diagnostics.mjs` |
| Geometry | Decoding a mesh for WebGL is a read-only capability. It does not validate reauthoring geometry, importing dependency graphs or changing collision. | [Mesh geometry](format/igz-mesh-geometry.md), M4A/M4B still UNKNOWN |

Code paths in this document are relative to `tools/ssa-archive/` unless specified otherwise. File offsets,
section-relative offsets and runtime addresses are different quantities. Runtime recipes use a measured base
plus the applicable file offset; copying a numeric offset from another level does not identify the same object.

## Levels and the rendered scene

The catalogue identifies 76 level archives, of which 75 contain placements; Title is a menu archive. An entry is
resolved by its name in the manifest, not by assuming the tutorial's entry index. Structural parsing of those
levels is broader evidence than edited boots: transforms are confirmed on Tutorial and Mining, while unbooted
levels remain LIKELY. Entry status and transform status are independent lookups. Mining's confirmed redirect
does not by itself prove that a transform, duplication or native addition works there.

Stored templates and disabled objects are retained in the scene and hidden in a dedicated layer. The placement
word at +0x54 and the interpretation of runtime states are based on measured levels and remain scoped findings.
Objects parked far away are excluded from framing extent, not deleted. A record at the origin is not sufficient
evidence of a broken transform.

The *As in game* overlay reads memory; it does not execute the game's scripts in JavaScript. Two unique stored
position triples locate a candidate resident section. Chunked reads are limited to 64 KB and must return every
requested byte within MEM1. Partial reads fail instead of becoming zero-filled evidence. Different chunks can
observe different game instants. The snapshot therefore remains LIKELY and read-only.

The clone scan looks for the known placement class outside that section and pairs candidates with resident
model/script resources. This is a heuristic, not a universal heap parser or complete actor census. A clone's
+0x5C parent names its template; it does not identify the script or actor that created it. Inspect
`src/editor/scene-snapshot.mjs` and [scene poses](editor/scene-poses.md) before interpreting missing scenery.

## Additions and their proof boundaries

Native addition calls the game's factory; it does not insert an IGZ record or import another level's resources.
The [nine exact tutorial sources](../specs/005-native-object-addition/compatibility.md) have separately confirmed
recipes, within the tested eight-addition scope, original scale, and initial transform conditions. Retaining
the same script path does not validate every source's script parameters or gameplay consequences.

Feature 007 permits other resident sources as explicitly experimental additions. The three numbers describe
different limits: 18 compiled slots, 59 rows in the compact table, and 590 as the editor's guard. The measured
152-addition Mining experiment does not prove a universal 590-object game capacity. Live tables need the editor
to write and refill them. MEM2 arena reservation is LIKELY research; no addition table uses that reservation yet.
See [the addition implementation and experiments](editor/adding-objects.md).

Before interpreting a verdict, distinguish these observations:

- A consumed row and plausible factory return establish an attempted creation with a returned instance address.
- A passing inspection additionally checks class/state, actor, source/model/script relationships and initial
  transforms. Initial transforms are separate from current AI/animation transforms.
- Pointers shared between inspected additions make that sample inconclusive. Sequential reads can observe
  address reuse, so this does not alone prove that two simultaneous live objects shared an actor.
- An earlier successful observation followed by an unavailable or unsuccessful final check means creation was
  observed and the final state is unverified. It does not identify a deletion, collection, or responsible script.
- Missing reads without creation evidence are inconclusive. An explicit failed inspection is a failed check;
  rendering and gameplay still need their own evidence even when memory checks pass.

The watcher samples at level captures, during play up to 40 times until every addition has been seen alive,
and at the end where possible. It does not track every frame. A live arrival may retry measurement before writing;
once writing has started, an uncertain bridge error must not replay creation in the same run. Some objects may
already exist even though the host did not receive the acknowledgement.

An object **kind** uses Content model/script paths across levels (or the documented bare-name fallback for records
with neither). A report **family** is stricter: probe version, original decoded-file SHA-256, archive, model/script
offsets and paths, and scale. A report names the exact tested source. A sibling gets a related-source indication,
not confirmation. Family history retains the latest 20 launch entries; it is not a lifetime statistical total.

## From an edit to a recorded run

| Stage | Responsibility and relevant implementation |
|---|---|
| Open | `level-open.mjs` / `session.mjs` resolve local inputs and build the scene; `server.mjs` holds the current session lock while an asynchronous open is pending. Failure retains the old session. |
| Edit | Session commands validate the operation, record history and change only supported properties. A validation/open/run lock prevents a conflicting launch or mutation. |
| Save | `save.mjs` checks allowed byte changes, including the final unaligned bytes, and verifies the exact written decoded buffer. Additions live in a sidecar. These two writes are not a crash-atomic filesystem transaction. |
| Patch | `patch/riivolution.mjs` builds replacement files and root-relative forward-slash paths. `native-patch.mjs` emits the companion; tutorial compiled bytes are pinned by tests. |
| Run | The editor-owned research profile installs the companion and uses the appropriate entry path. [Direct entry](editor/direct-entry.md) binds checkpoint identity and verifies consumption again after restore. Never reuse a native-initialized loaded-level state for a new patch. |
| Observe | `native-watch.mjs` coordinates measurement and inspections; `native-run.mjs` reads individual instances. One failed instance read must not discard successful observations for other rows. |
| Report | `addition-reports.mjs` records scoped verdicts. `addition-evidence.mjs` resolves both older tutorial batches and ordinary editor-run records; the report page displays all recorded captures and missing-record notices. |

HTTP bodies must be JSON objects; `discard` must be a boolean. Unsupported API methods return 405. Route errors,
including asynchronous GET failures, return through the server's error handler. Consult the feature
[007 API contract](../specs/007-unlimited-additions/contracts/additions-api.md) and the earlier editor contracts
for individual routes. Restart an old server after updating its backend: newly served browser files cannot add
`/api/library` to an already running older process.

## Reproduce, extend, or review

Start with [Dolphin MCP prerequisites](mcp/dolphin-mcp.md), then the relevant finding and its experiment protocol.
Keep the original disc and personal Dolphin installation untouched. Configure local paths under `.local/`, use
the dedicated profile, record input/patch/runtime identity, and reproduce the two boots before promoting scope.
Do not publish game archives, saves, figures or memory dumps.

From the repository root, run `npm test`, `npm run lint`, `npm run format:check`, the scripts under
`.github/scripts/`, and `node tools/ssa-archive/cli.mjs findings validate`. Local fixture coverage depends on local
game data; CI deliberately runs without it. Browser checks exercise the UI separately. Host tests and browser
success are not new Dolphin boot evidence. See the [audit record](reports/documentation-audit.md) for what was
actually checked, and [remaining tasks](../specs/README.md) for unimplemented research. M4A, M4B and M5 remain UNKNOWN.
