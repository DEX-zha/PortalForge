<div align="center">
  <img src="docs/images/portalforge-logo.png" alt="PortalForge logo" width="260" />
  <h1>PortalForge</h1>
  <p><b>A 3D level editor and reverse-engineering toolkit for <i>Skylanders: Spyro's Adventure</i> (Wii)</b></p>
</div>

<p align="center">
  <a href="https://github.com/DEX-zha/PortalForge/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/DEX-zha/PortalForge/actions/workflows/ci.yml/badge.svg?branch=main" /></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-blue?style=flat-square" />
  <img alt="Node" src="https://img.shields.io/badge/Node.js-24-339933?style=flat-square" />
  <img alt="Tests" src="https://img.shields.io/badge/tests-375%20SSA%20%2B%206%20MCP-brightgreen?style=flat-square" />
  <img alt="Gates" src="https://img.shields.io/badge/gates-M0--M3%20PASS-success?style=flat-square" />
  <img alt="Evidence" src="https://img.shields.io/badge/evidence-two%20identical%20boots-8A2BE2?style=flat-square" />
  <img alt="Local AI" src="https://img.shields.io/badge/local%20AI-2%C3%97%20DGX%20Spark-76B900?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0%20%C2%B7%20CC%20BY%204.0-blue?style=flat-square" />
  <img alt="Scope" src="https://img.shields.io/badge/fan%20research-non--commercial-lightgrey?style=flat-square" />
</p>

<p align="center">
  <a href="#what-is-portalforge">What is it</a> ·
  <a href="#the-editor">Editor</a> ·
  <a href="#evidence-not-vibes">Evidence</a> ·
  <a href="#what-works-today">What works</a> ·
  <a href="#getting-started">Getting started</a> ·
  <a href="#documentation">Docs</a> ·
  <a href="#how-the-project-is-developed">Development</a> ·
  <a href="#license-and-credit">License</a>
</p>

---

## What is PortalForge?

PortalForge turns a 2011 Wii game's level files into something you can open, look at in 3D, edit, and boot —
without ever touching the original disc image.

It is three things in one repository:

- **A format toolkit** — readers, writers and diffing for the game's `IGA v4` archives and the `IGZ v5` object
  graphs inside them, including the LZMA chunking, the placement records, the scripts and the GX mesh geometry.
- **A 3D editor** — a local server plus a browser view (Three.js, no bundler) that lists 76 archives and opens the game's 75
  scenes with their real geometry and placements (Title has no placements), lets you move, rotate, duplicate and **add** objects, and compiles
  the result back into a Riivolution patch.
- **An experiment harness** — a dedicated Dolphin instance driven over MCP, with input macros, memory reads,
  screenshots and machine-checked experiment records, so that every claim about the game can be reproduced.

Nothing here modifies your disc image: edits are shipped as replacement files loaded next to the original
through Riivolution, exactly the way the retail game reads them.

## The editor

[![PortalForge editor — full user capture on Level_021_Sheep](docs/images/editor-workspace.png)](docs/images/editor-workspace.png)

A Unity-like workspace: **Hierarchy** and layers on the left, the **Scene** in the middle with the level's real
decoded meshes and Move/Rotate/Scale gizmos, the **Inspector** on the right (position, model, behaviour script,
layers, shared state, evidence and safety flags), and the **Project** browser at the bottom with categories and
3D thumbnails generated from the level's own geometry. The **Level** tab lists all 76 archives with their
capabilities; the header picker opens the 75 scenes that contain placements. Title is a menu archive.

The Project scope switches between **This level** and **Whole game**: 8 800 kinds across 75 scenes, identified
by their model and script paths. Objects found only in other levels show where they live; their cards are
read-only until cross-level import is proven. Build or refresh this local index with `node tools/ssa-archive/cli.mjs edit catalogue`.

![The Whole game catalogue](docs/images/editor-catalogue.png)

Resident sources at scale 100 can be added, enemies and objects with nothing to draw included, and each card says
what stands behind its **Add**: a confirmed recipe, *verified in game* with the number of launches, *related
source tested*, *failed in game* with the reason, or *not verified*. The proof follows the addition instead of
gating it: every launch reads each added object back from the game's memory and files the result on its card.
A table holds 59 additions. The editor can refill it while the game runs: two Mining boots constructed 152
instances. The scene guard is 590, not a proven capacity. More than 59 additions require the editor launch;
eight additions from nine exact tutorial sources remain the confirmed scope. Other sources stay experimental.

The view shows the level as the game stores it: placed objects in the default layers, stored templates and
disabled objects (the ones a script clones or activates later) in a hidden layer of their own. While the level
plays in the launcher's Dolphin, **As in game** reads the running scene from memory and draws what the game
created at run time — the cannon on a moved push block, the fan blades, a key — over the stored placements.

The toolbar chain is the whole workflow: **Save → Patch → Launch**. Launch owns its own Dolphin, runs the
tutorial macro, captures every step and closes cleanly — or drops you straight into the chosen level to play
it yourself.

## Evidence, not vibes

A CONFIRMED editing recipe requires **two identical cold boots, proven file consumption and a visible
result**. Experimental additions are allowed separately: each launch checks their creation in memory and
records the result, without promoting them. Creation, survival and gameplay behavior are different claims.

The frames below are shown whole. Open an image to view the original PNG at its native resolution.
The in-game counts come from the recorded memory inspections, not from counting objects in a screenshot.

**Mining: 152 native creations through three live batches.** Two identical boots returned 152 instances each;
107 remained at the last reading of the pictured boot. This frame shows the running scene during its opening
dialogue, not all 152 objects. Scripts and interactions affect later survival. Run
`editor-direct-test-1789675647260-f7aa929c`, capture 11; [R1 results](specs/007-unlimited-additions/validation.md#r1--more-than-the-table-holds-152-additions-the-whole-level-in-one-boot-2026-09-17), LIKELY.

[![Mining during the 152-addition experiment, complete frame](docs/images/evidence-mining-152-additions.png)](docs/images/evidence-mining-152-additions.png)

**Mining: six added enemy sources.** Both boots verified 6/6 in memory; the final captures show fire at the
right edge and the Skylander displaced into view. Run `editor-direct-test-1789672812252-5e9db3c3`,
capture 11. Creation and observed movement are documented; full combat, damage and loot remain unvalidated.
[E2 results](specs/007-unlimited-additions/validation.md#e2--enemies-from-their-stored-templates-2026-09-17), LIKELY.

[![Mining enemy-template experiment, complete frame](docs/images/evidence-mining-enemy-templates.png)](docs/images/evidence-mining-enemy-templates.png)

**Undead Volcano: the first launch measures the level and fills the live table.** Both boots returned eight
instances; six survived every reading and two were removed by their scripts. This frame documents arrival
in the level; it does not establish the rendering of all additions. Run
`editor-direct-test-1789674397828-eb0134fc`, capture 11; [L1 results](specs/007-unlimited-additions/validation.md#l1--a-level-never-measured-the-table-written-into-the-running-game-2026-09-17), LIKELY.

[![Undead Volcano live-table experiment, complete frame](docs/images/evidence-undead-volcano-live-table.png)](docs/images/evidence-undead-volcano-live-table.png)

**Tutorial: a third sunflower through same-size replacement.** A weed slot is replaced; the original pair
is preserved. `editor-test-1789503985200`, two identical boots, CONFIRMED.

[![Three sunflowers instead of two, complete frame](docs/images/evidence-duplicated-sunflower.png)](docs/images/evidence-duplicated-sunflower.png)

**Tutorial: eight native additions near Hugo.** Barrel, coins and Chompy Nippers, with no sacrificed object.
Frame from `editor-direct-play-1789592930696`; the confirmed source/count scope is recorded in
[005 validation](specs/005-native-object-addition/validation.md).

[![Native additions near Hugo, complete frame](docs/images/evidence-native-additions-hugo.png)](docs/images/evidence-native-additions-hugo.png)

**The same tutorial additions during play.** Scripts and activation ranges are retained. This frame does not
validate complete combat or collection semantics.

[![Tutorial additions during play, complete frame](docs/images/evidence-native-additions-combat.png)](docs/images/evidence-native-additions-combat.png)

Run records stay under `.local/dolphin-evidence/editor-runs/` and `experiments/`;
[findings](docs/findings/) state confidence and limits. [Image provenance](docs/images/README.md) identifies
the exact local frames. The editor screenshot above was supplied by the user on 2026-09-18, shown uncropped;
its interface state is not independent proof of game behavior.

## What works today

| Capability | State | Where it is proven |
|---|---|---|
| Read, verify, rebuild and diff `IGA v4` archives (`.arc` / `.bld`, LZMA) | **CONFIRMED** | [`docs/format/iga-v4.md`](docs/format/iga-v4.md), gate M1 |
| Change one value in a level and see the predicted in-game effect | **CONFIRMED** | gate M2 |
| Duplicate a record by same-size replacement (never by insertion) | **CONFIRMED** | gate M3, [`docs/format/igz-level-editing.md`](docs/format/igz-level-editing.md) |
| Move / rotate / re-place props from the 3D editor | **CONFIRMED** on the tutorial; position edits on Mining; LIKELY elsewhere | [`specs/003-placement-editor-3d/`](specs/003-placement-editor-3d/) |
| Decode the level's GX mesh geometry and draw the real scenery | **LIKELY**, read-only | [`docs/format/igz-mesh-geometry.md`](docs/format/igz-mesh-geometry.md) |
| Translate a scripted prop together with its private trajectory | **CONFIRMED** | [`docs/editor/scripted-movement.md`](docs/editor/scripted-movement.md) |
| **Add** up to eight extra objects with no victim, from nine exact sources | **CONFIRMED** (tutorial, SSPP52 Rev1) | [`specs/005-native-object-addition/validation.md`](specs/005-native-object-addition/validation.md) |
| Boot straight into the edited tutorial, skipping the menus | **CONFIRMED** (tutorial only) | [`docs/editor/direct-entry.md`](docs/editor/direct-entry.md) |
| Open any of the 75 scenes by name and move its objects | **CONFIRMED** (tutorial and Mining, two identical boots each); LIKELY on the levels not booted with an edit yet | [`specs/006-multi-level-editing/`](specs/006-multi-level-editing/) |
| Boot straight into the chosen level from Patch (the level served under the tutorial's file names) | **CONFIRMED** (Mining, two identical boots); LIKELY for the other levels | [`docs/level-entry-status.json`](docs/level-entry-status.json) |
| Tell stored templates and disabled objects from placed ones, on every level | **LIKELY** (read in the running game on Mining) | [`docs/findings/`](docs/findings/) `igz.placement.inactive-flag` |
| Draw the scene as the game runs it: states, actors and the objects scripts create | **LIKELY**, read-only (Mining, one run) | [`docs/findings/`](docs/findings/) `level.runtime.scene-snapshot` |
| Add any object of any level, stored templates and enemies included, verified by every launch; a level never opened before is measured by its first launch | **LIKELY** (Mining: 8 of 8, 32 of 32 and six moving enemies; Undead Volcano, never measured: 8 of 8 written into the running game; two identical boots each; seen on screen for the enemies only) | [`specs/007-unlimited-additions/validation.md`](specs/007-unlimited-additions/validation.md) |
| Import objects held only in another level | **UNKNOWN**, gate M4A; the Whole game catalogue is read-only | [`specs/007-unlimited-additions/`](specs/007-unlimited-additions/) |
| More than 59 additions without the editor | **UNKNOWN**; a 256 KB MEM2 reservation held on two boots plus a control, but no table lives there yet | [007 validation](specs/007-unlimited-additions/validation.md) |
| New geometry, new collision, gameplay scripting | **UNKNOWN** — gates M4A / M4B / M5 | [`docs/editor/roadmap.md`](docs/editor/roadmap.md) |

`node tools/ssa-archive/cli.mjs gates` prints the current state of every gate with its evidence.

## How it works

```mermaid
flowchart TD
    A["Your own disc image<br/>WBFS — never modified"] -->|disc-extract| B["IGA v4 archive<br/>.arc / .bld"]
    B -->|decode LZMA chunks| C["IGZ v5 entry<br/>big-endian object graph"]
    C -->|parse| D["placements · layers · scripts<br/>models · GX meshes"]

    subgraph EDIT["3D editor — local server + browser view"]
        direction TB
        E["Hierarchy · Scene · Inspector · Project"]
        F["Editor session<br/>boot-proven planners"]
        G{"Save plan<br/>every changed word justified"}
        H["Refused — nothing written"]
        I["Edited IGZ<br/>+ additions sidecar"]
        E -->|intents, never bytes| F
        F --> G
        G -->|a byte outside an edited attribute| H
        G -->|VALID| I
    end

    D --> E

    I -->|rebuild, re-encode the entry| J["Archive rebuilt<br/>same layout, different bytes"]
    J --> K["Riivolution patch<br/>+ Gecko companion for native additions"]

    subgraph RUN["Experiment harness — dedicated Dolphin over MCP"]
        direction TB
        L["Owned Dolphin instance<br/>.local profile, cold boot"]
        M["Input macro<br/>menus · tutorial · movement"]
        N["FileMon size · MEM1 reads · screenshots"]
        O["Experiment record"]
        L --> M --> N --> O
    end

    K --> L

    O --> P{"Two identical boots<br/>and a visible result?"}
    P -->|no| Q["Unverified, LIKELY or failed<br/>record the actual result and limits"]
    P -->|yes| R["Finding CONFIRMED"]
    R --> S["Gates M0 – M5"]
    S -.->|CONFIRMED properties are editable| E
    O -.->|experimental additions keep runtime reports| E
    Q -.->|next hypothesis| F
```

Two things in that loop carry the project.

The **save plan** is the safety rail: it is built *before* the write, checked word by word against the bytes that
are about to be written, and any byte outside an edited attribute makes the whole save refuse rather than degrade.

The **findings loop** keeps confidence separate from availability. Editable file properties require confirmed
findings. Constitution 1.2.0 permits experimental runtime additions from resident sources, labelled and
inspected at launch; a family report never promotes its members automatically.

## Getting started

**Prerequisites** — Windows, Node.js 24, your own legitimate copy of the game as a WBFS image, and the Dolphin
research profile described in [`docs/mcp/dolphin-mcp.md`](docs/mcp/dolphin-mcp.md). No game data ships with this
repository, and none ever will.

```powershell
# Run from the repository root.
npm ci
npm ci --prefix tools/dolphin-mcp --ignore-scripts
npm ci --prefix tools/ssa-archive --ignore-scripts
npm test --prefix tools/dolphin-mcp
npm test --prefix tools/ssa-archive

# Set game, figure and Dolphin paths in .local/dolphin-config.json (see the MCP dossier).
node tools/ssa-archive/cli.mjs identify --game "D:/path/to/SSA.wbfs"
node tools/ssa-archive/cli.mjs edit levels
node tools/ssa-archive/cli.mjs edit open Level_027_Tutorial --port 7400 --open

# Once level workspaces are available, build the Whole game index.
node tools/ssa-archive/cli.mjs edit catalogue
```

The header of the editor lists every level of the disc; **Open** switches to another one, and the Level
information panel says what the editor can do there and on which evidence.

Then edit in the browser and press **Save → Patch → Launch**. The launcher owns its own Dolphin instance in
`.local/dolphin-user/`; your personal Dolphin installation is never driven, and the WBFS is never written to.

> The editor server must be started from a terminal that is allowed to create processes. A server started inside
> a restricted sandbox fails at launch time with `spawn EPERM` — see
> [`docs/editor/dolphin-workflow.md`](docs/editor/dolphin-workflow.md).

## Repository layout

```
tools/ssa-archive/     the toolkit: CLI, IGA/IGZ readers and writers, editor server, 3D view, tests
tools/dolphin-mcp/     the Dolphin MCP server, Python bridge and native UI helpers
specs/                 spec-kit features: spec, plan, research, data model, contracts, tasks, validation
docs/format/           file-format documentation (IGA v4, IGZ level editing, mesh geometry)
docs/editor/           editor workflow, direct entry, scripted movement, scene poses, roadmap
docs/mcp/              the Dolphin MCP dossier and the M0 gate
docs/findings/         every finding, with confidence, evidence and editable scope
docs/experiments/      how an experiment is run and judged
docs/reports/          generated corpus reports
docs/*-status.json     gate state, read by the tooling (`cli.mjs gates`)
.local/                everything game-derived: profiles, patches, dumps, captures — never committed
```

## Documentation

- **Start here** — [`docs/README.md`](docs/README.md) indexes every document.
- **Formats** — [IGA v4 containers](docs/format/iga-v4.md) · [IGZ level editing](docs/format/igz-level-editing.md) · [mesh geometry](docs/format/igz-mesh-geometry.md)
- **Editor** — [roadmap](docs/editor/roadmap.md) · [adding objects](docs/editor/adding-objects.md) · [patch, launch and scripted movement](docs/editor/dolphin-workflow.md) · [direct level entry](docs/editor/direct-entry.md) · [scene poses](docs/editor/scene-poses.md) · [missing-scenery study](docs/editor/missing-scenery-study.md)
- **Runtime** — [Dolphin MCP, gate M0](docs/mcp/dolphin-mcp.md) · [how experiments are judged](docs/experiments/README.md)
- **Findings** — [index](docs/findings/) with one JSON record per claim, rendered to Markdown by `cli.mjs findings render`
- **Specs** — [current status and remaining work](specs/README.md) · [001 level research](specs/001-ssa-level-research/) · [002 entity model](specs/002-igz-entity-model/) · [003 3D editor](specs/003-placement-editor-3d/) · [004 object workflow](specs/004-object-workflow/) · [005 native addition](specs/005-native-object-addition/) · [006 multi-level editing](specs/006-multi-level-editing/) · [007 unlimited additions](specs/007-unlimited-additions/)

## How the project is developed

**Spec first.** Every feature starts as a spec-kit folder under `specs/`: specification, plan, research, data
model, contracts, tasks, then a validation report written after the runs — not before. Tasks carry a real state;
a documented batch is never reported as a delivered one.

**Gates before capabilities.** M0 (runtime), M1 (archive round-trip), M2 (controlled mutation) and M3 (entity
duplication) are PASS; M4A (new assets), M4B (collision) and M5 (gameplay) are UNKNOWN, and no tool is allowed
to pretend otherwise. A property is only made editable once its finding is CONFIRMED; experimental runtime additions have the separate
labelled, launch-verified scope described above.

**Tests and reproduction.** 375 tests in `tools/ssa-archive`, 6 in `tools/dolphin-mcp`, plus scripted WebGL
browser runs (catalogue, and the level switch across three levels) and the two-boot Dolphin protocol. Failures and negative results are documented as carefully as the
successes — the research files are full of them, because they are what makes the successes trustworthy.

**One standard for the code.** Prettier and ESLint run over both tools from the repository root
(`npm run format`, `npm run lint`) and in CI, so style is never a review topic and an unused import or a
duplicated option key fails the build. Modules document their purpose; machine-specific paths live in
`.local/dolphin-config.json` rather than in the source, and a refactor of boot-proven code is checked against
recorded outputs of the real level before it lands.

**AI in the loop, including local models.** PortalForge is built with coding agents (Codex CLI and Claude Code)
and with **local inference running on two NVIDIA DGX Spark units**. Keeping a local tier matters here for a
practical reason: the material this project reasons over is game-derived — memory dumps, decoded archives and
in-game captures — and it stays on the researcher's own hardware. The agents write code, documentation and
experiment plans; the gates, the two-boot rule and the tests are what decide whether any of it is true.

**A human drives the reverse engineering.** The agents are fast at writing code and at grinding through dumps,
and consistently wrong about what a byte *means* until someone checks. The reverse-engineering and decoding
reasoning — what a record actually is, which pointer is real, why a level froze rather than loaded — is human
work, and so is the debugging: watching the Dolphin window, spotting that an "invisible" object was never the
one being moved, rejecting an agent's plausible-but-wrong logic and correcting it before it becomes a finding.
Several results in `docs/findings/` exist only because that review said "no, boot it again and look" — the two
identical boots are the rule precisely because a machine's confidence is not evidence.

## Scope, and what this project is not

PortalForge is an **amateur, non-commercial reverse-engineering project for research and preservation**. It is
not affiliated with Activision, Toys for Bob, Vicarious Visions or Nintendo; *Skylanders*, *Spyro's Adventure*,
*Portal of Power* and the related names belong to their respective owners.

The repository contains **no game data**: no disc image, no archive, no texture, no sound, no save and no figure
dump. All work happens on the copy the researcher legally owns, through replacement files loaded beside the
original image, never by modifying it. The few in-game screenshots published above are illustrative evidence for
documented experiments; the bulk of the captures, dumps and reports stays in the untracked `.local/` folder.

What is published here is a description of file formats and experimental methods, each with its confidence
level, so that other people can reproduce the experiments on their own copy.

## License and credit

Reuse is welcome — **with credit**. The repository is licensed in two halves:

| What | License | What it asks of you |
|---|---|---|
| Code — `tools/`, and any snippet in the docs | [Apache-2.0](LICENSE) | Keep the copyright notice, this [`NOTICE`](NOTICE) file and the license text with any redistribution, and state prominently which files you changed. |
| Documentation, specs, findings and reports — `README.md`, `docs/`, `specs/` | [CC BY 4.0](LICENSE-DOCS) | Credit PortalForge, link to the license, and say if you changed anything — for copies, translations and adaptations alike. |

Suggested credit line:

> Based on **PortalForge** — https://github.com/DEX-zha/PortalForge
> Code: Apache-2.0 · Documentation and findings: CC BY 4.0

This covers the reverse-engineering work as it is written here: the format descriptions, the record layouts and
offsets, the editing recipes, the experiment protocols and the evidence tables. Two honest notes about that.
First, copyright protects the way those results are expressed, not a technique or a measured fact once you have
re-derived or re-expressed it yourself — no license can change that, and this one does not pretend to. Second,
that is exactly why the request matters: every offset in `docs/` cost boots, frozen levels and negative results
that are documented alongside the successes. If your editor, tool, wiki page or video stands on this work, name
it and link back, so the next person can find the evidence behind the claim rather than the claim alone.

Game data is out of scope of both licenses: nothing here grants any right over *Skylanders: Spyro's Adventure*,
its archives, its assets or its trademarks.
