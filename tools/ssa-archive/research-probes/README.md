# Research probes

One-off scripts written while the file formats were still unknown. They are kept because findings cite them as
the source of a measurement, not because anything depends on them: no module imports a probe, and no test runs
one.

- They read game data from `.local/`, with paths relative to `tools/ssa-archive/`, so run them from there:
  `node research-probes/probe-chunks.mjs`.
- They print to the console and write nothing into the repository.
- What a probe established lives in `src/` and in `docs/findings/`. A probe is the record of how a result was
  first obtained; the maintained implementation is the module that replaced it.

| Probe | What it measured | Superseded by |
|---|---|---|
| `probe-chunks.mjs` | The LZMA chunk tables of `.bld` entries | `src/iga/chunks.mjs`, `src/iga/decode.mjs` |
| `probe-iga-header.mjs`, `probe-iga-contents.mjs` | The IGA v4 header, hash table and entry table | `src/iga/header.mjs`, `src/iga/reader.mjs` |
| `probe-word10-formula.mjs` | Header word 0x10 and the hash lookup bound | `src/iga/header.mjs` |
| `survey-level-headers.ps1` | Header words across every level archive | `.local/disc/level-headers.jsonl` |
| `probe-igz-sections.mjs`, `probe-igz-objects.mjs` | The IGZ section table and the first object enumeration | `src/igz/header.mjs`, `src/igz/objects.mjs` |
| `probe-igz-near.mjs`, `probe-igz-spawn.mjs`, `probe-igz-physmodel.mjs` | Records near the measured player position | `igz near`, gate M2 |
| `probe-mesh-coverage.mjs` | How much decoded geometry reaches the editor view | `docs/editor/missing-scenery-study.md` |

Nine probes whose results were fully absorbed and that nothing referenced were removed; they remain in the
history.
