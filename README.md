# PortalForge — SSA Research Toolkit

Projet de recherche sur les niveaux personnalisés de Skylanders: Spyro’s Adventure Wii.

L'étape préliminaire obligatoire est **M0 : Dolphin MCP opérationnel**, validée le 12 septembre 2026 (`docs/m0-status.json`). Son installation, ses essais réels et ses limites sont décrits dans [le dossier Dolphin MCP](docs/dolphin-mcp.md). La recherche IGA et le développement du toolkit peuvent commencer.

La [spécification SSA](specs/001-ssa-level-research/spec.md) conserve les portes M1 (archive round-trip) et M2 (mutation contrôlée) avant tout éditeur.

Le MCP local se trouve dans `tools/dolphin-mcp`. Le toolkit de recherche `ssa-archive` (lecture, extraction, vérification, reconstruction et diff des archives IGA v4, décodage LZMA, workspace de patch Riivolution, expériences M1/M2 pilotées par le MCP, découvertes documentées) se trouve dans `tools/ssa-archive` ; son plan et ses contrats sont dans `specs/001-ssa-level-research/`. Les découvertes sur le format sont dans `docs/iga-v4.md` et `docs/findings/`, les portes dans `docs/m*-status.json` (`node cli.mjs gates`). Les binaires Dolphin, profils, patches et preuves de test restent dans `.local/`, exclu du versionnement.
