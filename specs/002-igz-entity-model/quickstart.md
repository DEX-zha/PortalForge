# Quickstart: IGZ v5 Level Object Model

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
