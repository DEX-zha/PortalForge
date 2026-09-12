# PortalForge project prerequisites

The user requires an operational Dolphin MCP as a preliminary step in project creation.

- Read `docs/dolphin-mcp.md` before planning or implementing SSA archive/level features, and `docs/iga-v4.md` before touching archive code.
- Gates: `node tools/ssa-archive/cli.mjs gates` prints M0..M5 from `docs/m*-status.json`. M0 is PASS (2026-09-12). M1 and M2 must both be PASS before substantial editor work (viewport, import, object creation, menu expansion); M0 does not validate archive round-trip or world mutation. The constitution (`.specify/memory/constitution.md`) records these invariants.
- Never infer readiness from `tools/list`, a process launch, a scheduled action, a successful boot of a Riivolution descriptor, or an empty/black screenshot alone. Consumption of a replaced file is proven by Dolphin's file monitor size line or a memory read; the rebuilt variants used for M1 are byte-different on purpose so the monitor can tell them apart.
- Preserve the original WBFS and the existing Dolphin 2606a installation (never drive the user's own Dolphin process). Use the dedicated `.local/` profiles and replacement files for experiments.
- Do not commit game data, figures, saves, memory dumps or captured game images. Local evidence stays in `.local/`.
- Game-mod descriptor paths must use forward slashes, and Riivolution `external` paths must start with `/` (root-relative); otherwise Dolphin silently serves the original file. Use `buildPatchWorkspace` from `tools/ssa-archive/src/patch/riivolution.mjs`.
- Findings live in `docs/findings/records/*.json` with CONFIRMED / LIKELY / UNKNOWN labels; only CONFIRMED findings may be marked editable. Render docs with `node cli.mjs findings render`; never edit the generated Markdown.
- In-game runs: `dolphin_frame_advance` waits at least N frames (15 s bound); heavy disc loads (Title.arc, global.arc) stall frames for a minute or more, so waits and captures tolerate consecutive timeouts. `Plus` pauses the game. Dolphin panic alerts are disabled in the research profile (`UsePanicHandlers = False`) because they pause emulation. State slots are 1..10 through the native UI.

Local checks: `npm test` from `tools/dolphin-mcp` and from `tools/ssa-archive`. Real-game tests: `node live-test.mjs` (MCP), `npm run proof` (M0), and from `tools/ssa-archive`: `node cli.mjs experiment explore|m1|m2|live-probe` (each boot to the tutorial takes about 4.6 min; records under `.local/dolphin-evidence/experiments/`).
