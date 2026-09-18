# Quickstart: IGZ v5 Level Object Model

> Scope reviewed 2026-09-17: this feature records its original design and evidence. Later extensions and
> remaining work are mapped in the [specification status](../README.md); historical limits below are not the
> current editor limits.

Prerequisites: feature 001 complete (M0, M1, M2 PASS), `.local/workspaces/tutorial-bld` extracted and decoded (`node cli.mjs extract ... --decode`), Sonic Boom figure, interactive desktop. Commands from `tools/ssa-archive`.

## Scenario 1: object graph accounting (SC-001)

```powershell
$lvl = "..\..\.local\workspaces\tutorial-bld\entries\3-level.bld.decoded"
node cli.mjs igz sections $lvl
node cli.mjs igz types $lvl --histogram
node cli.mjs igz objects $lvl --out ..\..\.local\workspaces\tutorial-bld\graph.json
```

Expected: 9 sections ending at the file size; 224 types; accounting line with `unparsed` regions listed explicitly and `objects + unparsed + padding == total`. Repeat on `challenge_level_000-bld` and `challenge_level_001-bld`.

## Scenario 2: show the CONFIRMED spawn record

```powershell
node cli.mjs igz show $lvl 0x1a76ec
node cli.mjs igz match $lvl --address 0x80ed1ba0
```

Expected: type `tfbPhysicsModel`, field `+0x94` typed `f32be x3` = (91.73, 10.31, 44.74) flagged CONFIRMED via `level.physicsmodel.spawn-candidate`; the RAM address maps to the owning object and field.

## Scenario 3: confirm a new entity field (SC-002)

```powershell
node cli.mjs experiment ram-diff --figure "<Sonic Boom.sky>" --save-slot 6 --label ram-diff3   # or live-probe on a moving entity
node cli.mjs igz near $lvl <x> <y> <z> --tol 3 --no-dimensions
node cli.mjs experiment m2 --archive level/Level_027_Tutorial.bld --entry 3 --offset <n> --type f32be --value=<v> --predict "..." --finding <id> --repeat 1 --skip-control   # screening
node cli.mjs experiment m2 ... --repeat 2                                                                                                                   # formal
node cli.mjs experiment m2-judge --id <id> --run 1 --observed "..." --match yes|no
```

Expected: PASS only with two identical runs; `findings promote ... --to CONFIRMED --experiment <id>`.

## Scenario 4: duplication (M3)

```powershell
node cli.mjs igz clone ..\..\.local\workspaces\tutorial-bld --object 0x1a76ec --finding level.physicsmodel.spawn-candidate --set position.x=99.73 --out ..\..\.local\workspaces\tutorial-bld\level-cloned.bld --plan ..\..\.local\workspaces\tutorial-bld\clone-plan.json
node cli.mjs experiment m3 --archive level/Level_027_Tutorial.bld --entry 3 --plan ..\..\.local\workspaces\tutorial-bld\clone-plan.json --predict "..." --repeat 2 --figure "<Sonic Boom.sky>"
```

Expected: plan `VALID` before any run; two identical runs with the predicted independent instances; `docs/m3-status.json` written by hand with the experiment id, or the blocking unknown named.

## Scenario 5: why a clone stays inert, and the reachable clone (convergence, 2026-09-13)

```powershell
$lvl = (Resolve-Path ..\..\.local\workspaces\tutorial-bld\entries\3-level.bld.decoded).Path
node cli.mjs igz refs $lvl 0x1a76ec --depth 2                                   # who points at the spawn record (its type-92 owner), who points at the owner (header-table entry)
node cli.mjs experiment ptr-scan --file $lvl --dimensions --no-dimensions --address 0x1a7658,0x1a76ec --figure "<Sonic Boom.sky>"   # 1 boot: resident section dump
node cli.mjs igz fixups $lvl ..\..\.local\dolphin-evidence\ptr-scan-section1.bin --out ..\..\.local\dolphin-evidence\fixups.json      # visited objects, pointer/id words
node cli.mjs igz clone-entity $lvl 0x1a7658 --end 0x1a7900 --fixups ..\..\.local\dolphin-evidence\fixups.json --finding level.physicsmodel.spawn-candidate --set 0x128=99.73 --also-finding igz.loader.pointer-traversal --out ..\..\.local\workspaces\tutorial-bld\entity-clone.decoded --plan ..\..\.local\workspaces\tutorial-bld\entity-clone-plan.json
node cli.mjs experiment m3 --archive level/Level_027_Tutorial.bld --entry 3 --plan ..\..\.local\workspaces\tutorial-bld\entity-clone-plan.json --predict "..." --repeat 2 --figure "<Sonic Boom.sky>" --probe 42c775c34124f66f4232f6e3:148:clone-physics
```

Expected: `igz fixups` reports objects the loader never rewrote (272 in the tutorial, none of them pointed at by a rewritten object); the plan is `VALID` with one new header-table entry; in the patched runs the probe finds the clone's position triple and the header 148 bytes before it starts with a class pointer (`visited`), unlike the first M3 clone.
