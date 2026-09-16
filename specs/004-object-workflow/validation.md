# Validation du lot 1 — 2026-09-15

Suite aux retours utilisateur : **250 tests SSA et 6 tests MCP PASS** après ajout du dépôt par capture du pointeur, du bouton Reset scene et passage de l'interface en anglais. Le scénario navigateur utilise désormais de vraies entrées souris, vérifie deux destinations et les annulations, puis un reset après sauvegarde et la récupération exacte avec Redo. Détails, commandes et preuves : [interface.md, UI06–UI09](interface.md). La validation en jeu historique ci-dessous reste celle du lot 1 ; aucun nouveau passage en jeu n'est revendiqué pour ces corrections.

## Résultat et périmètre

US1 livré : catalogue de tous les placements, recherche nom/modèle/calque, catégories, sélection avec cadrage/révélation, glisser-déposer avec fantôme, surface visible ou plan horizontal réglable, choix explicite de l'emplacement consommé, plan complet et acquittements critiques. Aucune écriture avant confirmation. Une confirmation = une édition, undo/redo exacts. Les plans deviennent périmés après une édition, même annulée. Sources scriptées, ressources inactives, absence de modèle/carte runtime ou de taille compatible expliquées et refusées.

La scène et ses modèles sont reconstruits après remplacement et undo/redo. Une bibliothèque de géométrie locale conserve les associations originales ; un modèle partagé renommé reprend les meshes de la ressource source déjà présente. Aucun transfert inter-niveaux et aucune écriture de géométrie. Une association ambiguë reste un proxy.

## Vérifications locales

- `npm test`, tools/ssa-archive : **246/246 PASS**.
- `npm test`, tools/dolphin-mcp : **6/6 PASS**.
- Régression reproduite puis corrigée : la copie affichait l'herbe de la victime malgré son chemin tournesol. Test des meshes et captures après correction : tournesol correct, restauration de l'herbe sur undo puis tournesol sur redo ; décor inchangé.
- Navigateur Edge WebGL dédié, événements HTML5 via CDP sur les vrais éléments : **673/673 objets**, recherche insensible à la casse **3 ms**, cadrage, aperçu, annulation sans mutation, victime non présélectionnée, critique bloquant la confirmation, une édition, undo/redo identiques octet par octet, nouveau dépôt disponible après confirmation, aucune exception navigateur.
- Scène réelle Three.js isolée : intersection à Y=5, calque masqué exclu et secours à Y=2, filaire pris en compte, fantôme ignoré par le rayon, dépôt hors canvas/altitude invalide refusés, caméra conservée à la reconstruction.
- Rapports/captures : `.local/object-workflow/browser-1789505000412/`, `latest-browser.json`. Script reproductible : `tools/ssa-archive/tests/browser-catalog.mjs`.

## Deux boots Dolphin

Le dépôt effectif du navigateur copie **sunflower_Template(1)** (0x3495E4) sur l'emplacement choisi **weed_2_Template(8)** (0x34AC60), position **[91.349, 10.435, 43.275]**, heading 285°, scale 100. Source conservée, nom victime conservé, recette wrapper-proven. Les effets sur le modèle partagé ont été montrés et acquittés.

Entrée sauvegardée SHA256 : `957a13bd17757e8c0c6d76b23ac13761389693bba21571be4f17a2b0e5e25066`.
Archive reconstruite SHA256 : `e3e7a9fbac23ab46ffb4188cb2776bddf5662c9efa023243caf8df155b3d98cc`.
Le builder a vérifié l'identité de l'entrée reconstruite avec la sauvegarde. Les essais navigateur ont produit les mêmes octets ; les deux boots utilisent le premier patch sans reconstruction entre eux.

| Boot | Consommation | Observation | Fermeture |
|---|---|---|---|
| editor-test-1789503985200-c0276b1d | FileMonitor 15 333 kB, original 15 241 kB | Troisième tournesol sur l'îlot, paire originale conservée, Sonic Boom reconnu et déplacements droite/gauche | Normale, PID 34500, forced=false |
| editor-test-1789504260678-b4ece022 | Même archive, FileMonitor 15 333 kB | Même copie visible, Sonic Boom avance sur le pont puis revient | Normale, PID 9180, forced=false |

Captures examinées : suffixes `46-tutorial-skylander`, `49-tutorial-moved-right`, `52-tutorial-moved-left` dans `.local/dolphin-evidence/` ; rapport `.local/object-workflow/game-proof.json`. La recette explique le changement des autres utilisateurs du modèle weed ; ils n'ont pas tous été inspectés visuellement à distance. Aucun succès collision/script/import n'est déduit de ce test. M4A/M4B/M5 restent UNKNOWN.

## Éditeur utilisateur

Serveur actualisé sur le port 7400 en dehors du bac à sable qui provoquait spawn EPERM. Session `s_d58eb87d`, 0 opérations appliquées et **44 opérations Redo** conservées ; chaque état reconstruit et comparé aux octets du plan avant arrêt de l'ancien serveur. Sauvegarde SHA256 `45be5ecdffaee44309feff64fd2ba82dc36043af81ddcb25f5244a9a19ea88fe`, patch et état dirty conservés. Le test de duplication utilise une session distincte. Actualiser la page charge l'explorateur.

## Suite

T001–T009 terminées. T010–T017 forment le backlog US2/US3 documenté dans research.md et tasks.md. La note ancienne conseillant un état déjà dans Mining a été corrigée : cet état peut restaurer des ressources antérieures au patch.
