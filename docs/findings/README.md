# Research findings

Every documented structure of the SSA Wii data is a **finding record** in `records/<id>.json`, validated against `specs/001-ssa-level-research/contracts/finding-record.schema.json`, and rendered to one Markdown table per category (`container.md`, `igz-objects.md`, `world-entities.md`, `visible-geometry.md`, `collisions.md`, `gameplay-logic.md`, `references.md`) with:

```powershell
cd tools/ssa-archive
node cli.mjs findings validate
node cli.mjs findings render
```

## Record format

| Field | Meaning |
| --- | --- |
| `id` | Stable identifier, `[a-z0-9.-]`, for example `iga-v4.header.word-0x14` or `level.entity.transform.x` |
| `category` | One of the seven categories above; collisions are never inferred from visible geometry (FR-014) |
| `structure`, `meaning` | What the bytes are and what they mean |
| `location` | `file_pattern`, `offset` (number or expression), `length` |
| `type`, `endian` | Data representation; `endian` may be `unknown` |
| `evidence[]` | `{experiment_id | probe, summary}`; experiments live in `.local/dolphin-evidence/experiments/` |
| `confidence` | `CONFIRMED`, `LIKELY` or `UNKNOWN` |
| `editable` | `true` only when `confidence` is `CONFIRMED` (schema-enforced) |

## Confidence rules (FR-013, SC-005)

- **UNKNOWN**: a hypothesis. Published as such, never as behaviour.
- **LIKELY**: at least two independent, concordant observations (distinct probes or experiments).
- **CONFIRMED**: an experiment record with `status: PASS` that references the finding, typically an M2 mutation repeated twice with the predicted result.
- Any contradicting experiment sends the finding back to **UNKNOWN**, with the contradiction kept in `evidence`.

No CLI command exposes a finding as an editable property unless it is CONFIRMED and flagged editable. The toolkit refuses to save a record that violates this.
