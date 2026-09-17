# Levels API (feature 006)

Two routes added to the editor server, next to the ones in
[003 editor-api.md](../../003-placement-editor-3d/contracts/editor-api.md). Both answer JSON; a refusal is a 409
with `error` and `reason`.

## `GET /api/levels`

```json
{
  "current": {
    "archive": "level/Level_000_Mining.bld",
    "key": "level/level_000_mining.bld",
    "name": "Level_000_Mining",
    "family": "story",
    "capabilities": {
      "transform":    { "available": true,  "confidence": "LIKELY",  "finding": "level.transform.other-levels", "why": "…" },
      "duplicate":    { "available": false, "confidence": "UNKNOWN", "finding": "igz.loader.fixup-map", "why": "…" },
      "add":          { "available": false, "confidence": "UNKNOWN", "finding": "level.prop.native-addition", "why": "…" },
      "test":         { "available": false, "confidence": "UNKNOWN", "finding": null, "why": "…" },
      "direct_entry": { "available": false, "confidence": "UNKNOWN", "finding": "level.entry.preload-checkpoint", "why": "…" }
    }
  },
  "switching": true,
  "levels": [
    {
      "archive": "level/Level_000_Mining.bld",
      "key": "level/level_000_mining.bld",
      "name": "Level_000_Mining",
      "family": "story",
      "tutorial": false,
      "original": { "file": "…/.local/samples/DATA/files/level/Level_000_Mining.bld", "present": true },
      "workspace": { "dir": "…/.local/workspaces/level_000_mining-all", "present": true,
                     "entry": { "index": 3, "name": "level.bld", "file": "…/entries/3-level.bld.decoded", "decoded": true } },
      "runtime_map": null,
      "placements": 617,
      "direct_entry": "UNKNOWN",
      "ready": true,
      "capabilities": { "…": "same shape as current.capabilities" },
      "current": true
    }
  ]
}
```

- `family` is one of `story`, `hub`, `challenge`, `pvp`, `other`; levels are sorted by family then name.
- `runtime_map` is `{ "file", "source" }` with `source` in `config`, `folder`, `default`, or null.
- `switching` is false when the server was started on one file (`edit serve`): the picker is then hidden.
- `current.capabilities` comes from the session when it was opened through the catalogue, from the catalogue
  entry otherwise, and is derived from the session as a last resort.

## `POST /api/open`

Body: `{ "archive": "<disc path | level name | workspace name>", "discard": false }`.

Success (200): `{ "opened": <session summary as GET /api/session> }`. The session summary now carries `level`:
`{ name, family, tutorial, runtime_map, capabilities }`, null for a session opened on a file.

Refusals (409):

| `error` | When |
|---|---|
| `OPEN_UNAVAILABLE` | the server has no way to open a level by name (`edit serve`) |
| `SESSION_LOCKED` | an editor-owned Dolphin run or a validation batch holds the session |
| `BAD_VALUE` | no level named |
| `UNSAVED_CHANGES` | the scene is dirty and `discard` is not true; `undo_depth` is included |
| `NO_SUCH_LEVEL` | the name matches nothing; the reason lists the closest names |
| `NO_GAME` | the original was never extracted and no game image is configured |
| `ARCHIVE_INVALID`, `NO_LEVEL_ENTRY`, `DECODE_FAILED` | the archive cannot be extracted or decoded |
| `OPEN_REFUSED` | the session refused the decoded entry (no placement class, contract violation, gates) |

After a success the previous session is gone: its edits, history, save and patch references are not kept, which
is why `UNSAVED_CHANGES` exists. A pending validation batch is forgotten with it; it cannot be running, since
that refuses the switch.
