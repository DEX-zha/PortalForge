# Additions and game catalogue API (007)

This extends [005's confirmed baseline](../../005-native-object-addition/contracts/addition.md) and
[006's level API](../../006-multi-level-editing/contracts/levels-api.md). It describes the current code;
phase B activation edits, phase C imports and the reserved-memory table are not API capabilities yet.

## Resident additions

`POST /api/edit` accepts `{ "kind": "add", "source": <original offset>, "position": [x,y,z] }`.
The source belongs to the open session and keeps scale 100. Missing sources, copies used as sources,
non-finite positions, unsupported fields, locked sessions and the 590 scene guard are refused without mutation.
The underlying native-addition finding must remain confirmed. A source with its own exact confirmed tutorial
recipe is confirmed; every other eligible source creates an addition marked `experimental: true`, persisted
in the session, sidecar and patch. No foreign offset or victim is accepted.

Added placements have negative identities. Their position and heading can be transformed; scale cannot.
Undo/redo, reset and save/reopen preserve the addition intents. A launch inspects each addition and files
per-family results; a report does not promote a source. Scripts may remove a successfully created instance.

`GET /api/catalog` includes:

```json
{
  "addition_mode": "native",
  "addition_capacity": {
    "used": 0,
    "limit": 590,
    "confirmed": 8,
    "fits": { "slot": 18, "table": 59 }
  }
}
```

`entries` carry `folder`, `kind` and per-source `addition` diagnostics. `compatibility` carries counts and
family diagnostics. `limit` is an editor guard, not measured game capacity; `confirmed` refers to the original
bounded tutorial experiment, not eight arbitrary sources on any level.

Measured levels compile slot/table layouts when they fit. An unmeasured level, or more than 59 additions,
uses the live routine: the editor launch measures the level, writes rows, anchor, then count, and refills
in batches when needed. That scene requires the editor launch. The individual
`POST /api/addition-validation` test remains tutorial-only; automatic launch inspection works across levels.

## Whole game library

`GET /api/library` reads the local catalogue without modifying the scene. With no compatible cache it returns
`{ "status": "missing", "kinds": [] }`; otherwise:

```json
{
  "status": "ready",
  "built": "<ISO timestamp>",
  "levels": 75,
  "here": 323,
  "elsewhere": 8477,
  "kinds": []
}
```

Counts above illustrate Mining in the recorded 8 800-kind catalogue; they are not constants. Each kind has
`key`, `name`, `model`, `script`, `folder`, `levels` and `here`. A level member contains
`{archive,name,records,templates}`. `here` is `{offset,records,templates}` only when the open level holds the
kind, otherwise null. A foreign kind carries no source offset. Identity uses full Content model/script paths;
records with neither use their normalized bare name, which is a fallback identity rather than asset equivalence.

`POST /api/library` rebuilds the cache from ready decoded workspaces using the server's level/open dependencies,
without switching the current session. If those dependencies are absent it returns 409 `LIBRARY_UNAVAILABLE`
and asks to start with `edit open <level>`. Each level is opened to check its digest; unchanged grouping is reused.
Errors are kept in the local cache. The placement-free Title archive is not one of the 75 scenes.

Cache: `.local/catalogue/kinds.json`. CLI equivalent: `node tools/ssa-archive/cli.mjs edit catalogue`
from the repository root. Foreign cards remain read-only until the import experiments succeed.
