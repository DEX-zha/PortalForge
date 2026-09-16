# Plan — workflow objets

2026-09-15. [Spec](spec.md). Trois lots documentés ; seul US1 à implémenter.

## Contexte et gates

Node.js ESM, HTTP local, Three.js et DOM sans bundler. Tests node:test, navigateur WebGL et Dolphin dédié. Aucun paquet ajouté ; preuves dans .local/. M0–M3 PASS ; M4A/M4B/M5 UNKNOWN. US1 utilise uniquement les remplacements de même taille confirmés, avec emplacement choisi explicitement. Aucun nouveau writer de géométrie, collision ou script.

## Architecture et séquence

1. Spécifier, documenter recherche/contrats et générer les tâches.
2. Tests dans tools/ssa-archive/tests/editor-catalog.test.mjs avant implémentation.
3. src/editor/catalog.mjs : catalogue distinct de placement-v1, préparation immuable liée à une révision, confirmation via applyEdit. src/editor/server.mjs expose les routes ; session.mjs retourne les plans sans règle critique et signale les reconstructions nécessaires.
4. src/view/catalog.mjs : filtre, sélection et dépôt. scene.mjs : intersection visible ou plan horizontal réglable, fantôme conservant orientation/échelle. index.html : panneau et confirmation explicite de la victime. app.mjs recharge placements et meshes après replace/undo/redo en préservant caméra/calques.
5. Suites locales, navigateur, deux boots identiques avec preuve de consommation et résultat visuel. Préserver la session utilisateur lors du redémarrage.
6. US2 futur : catalogue externe, diagnostic, réutilisation locale puis recherche import M4A/M4B/M5.
7. US3 futur : entrée avant chargement, preuve d'identité et consommation, matrice par niveau.

Correction issue du contrôle visuel : src/editor/meshes.mjs conserve une bibliothèque des meshes du niveau avant remplacement. Les chemins modèles renommés utilisent la géométrie locale d'origine correspondante ; une association ambiguë reste un proxy. Tests dans tests/editor-meshes.test.mjs, incluant les autres utilisateurs d'un modèle partagé et undo/redo. Scénario navigateur reproductible dans tests/browser-catalog.mjs.

## Validation

Aucun octet avant confirmation ; refus script/inactif, sans runtime map, plan périmé ou session verrouillée ; une édition undo/redo exacte. Comparer entrée reconstruite/sauvegardée. Dolphin : FileMonitor ou RAM, copie visible, victime et effets partagés expliqués, jeu fonctionnel. Les lots futurs ont leurs propres gates ; leur documentation ne vaut pas livraison.
