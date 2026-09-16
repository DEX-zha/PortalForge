# Recherche — 2026-09-15

## Duplication locale

planReplaceRecord travaille dans un seul buffer et relocalise uniquement les références internes. Conserver applyReplace / replacePlacement ; emplacement existant de même taille obligatoire. Les modèles partagés imposent plan et acquittements. Un candidat compatible en taille ne garantit pas un plan valide. Les sources scriptées/inactives restent consultables mais non déposables. Insérer des records décalerait les parcours du loader, hors M3.

## Import inter-niveaux

Indices de types propres aux fichiers ; noms parsés non fiables comme identité. Le chemin .mdl ne suffit pas. Fermer les dépendances : placement, compagnons, chaînes, modèles, références, GX tags 44/51, matériaux/textures tag 31, handles globaux, scripts, collision Havok 25, animation 65 et audio FSB4. gxmesh.assignUnits utilise aussi des heuristiques spatiales et ne prouve pas cette fermeture. Handles globaux partiellement inconnus ; le writer IGA ne crée pas de nouvelles entrées.

Décision : catalogue externe en lecture seule puis rapport local_reuse_candidate / new_resources_required / unresolved_dependencies / no_compatible_slot / runtime_map_required. La réutilisation copie uniquement une instance de la cible. Le vrai import commence par une décoration statique après M4A ; collision M4B et scripts M5 séparés.

Preuve : ressource absente de la cible originale, octets/références transplantés identifiés, construction/rendu observés lors de deux boots et autres utilisateurs contrôlés. Une réutilisation locale ne constitue pas un import.

## Chargement direct

editor/dolphin-run.mjs automatise uniquement le tutoriel en traversant les menus. dolphin_load_state retourne load_scheduled sans prouver le niveau. Un état restaure la RAM : le slot 6 original peut masquer le patch.

Privilégier un état avant transition puis prouver une nouvelle lecture après restauration. Une reprise en scène chargée est seulement un cache lié aux hashes état/jeu/runtime/configuration/patch/sources. Tout changement l'invalide ; restaurer ce cache n'est pas une nouvelle preuve de consommation.

Aucune API moteur de sélection de niveau confirmée. Les chaînes load to level et champion level load sont des pistes UNKNOWN, sans opcode identifié. Rechercher DOL et références avant toute écriture.

Protocole : identité départ, patch confirmé, instance dédiée, restauration/transition, nouvelle borne des logs, identité cible + taille distinctive FileMonitor ou RAM + modification visible + Skylander jouable. Deux boots identiques ; étendre à Mining puis une autre famille et tenir une matrice par niveau. Aucun fallback silencieux tutoriel.

Sources : docs/dolphin-mcp.md, docs/iga-v4.md, docs/igz-level-editing.md, docs/experiments/README.md ; findings igz.types.per-file-indices, igz.placement.shared-model-record, igz.flagged-word.global-handle ; src/igz/{relocate,gxmesh}.mjs ; src/editor/{session,dolphin-run}.mjs ; tools/dolphin-mcp/server.mjs.
