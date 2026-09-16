# Tasks: Ajout réel

## Phase 1 — Setup

- [x] T001 Spécifier le choix d'ajout réel et ses critères dans specs/005-native-object-addition/spec.md, plan.md et checklists/requirements.md.
- [x] T002 Corriger les summaries de dossiers dans tools/ssa-archive/src/view/catalog.mjs et workspace.css ; tester Espace/Entrée dans tests/browser-catalog.mjs.

## Phase 2 — Recherche fondatrice

- [x] T003 Auditer les limites M3 et inventorier les clones dans .local/object-workflow/addition-audit.mjs ; consigner les limites dans research.md.
- [x] T004 Identifier le handler natif et ses paramètres depuis les dumps MEM1 dans .local/native-addition/ ; documenter la provenance et la confiance dans research.md.
- [x] T005 Instrumenter un appel clone témoin via Dolphin dédié, avec traces bornées dans .local/native-addition/ ; démontrer que le contexte observé est celui du clonage.
- [x] T006 Démontrer une création nette exploratoire, puis une représentation de patch persistante sur 2 boots ; consigner les résultats dans docs/findings/records/ sans activer de propriété non confirmée.

## Phase 3 — US1 Ajouter en jeu

- [x] T007 [US1] Après T006, écrire les tests de création sans victime et de conservation des originaux dans tools/ssa-archive/tests/editor-addition.test.mjs.
- [x] T008 [US1] Implémenter la recette confirmée et sa sauvegarde/export dans tools/ssa-archive/src/editor/, selon contracts/addition.md.
- [x] T009 [US1] Relier le dépôt aux ajouts confirmés dans tools/ssa-archive/src/view/catalog.mjs et scene.mjs ; refuser les sources inconnues en anglais.
- [x] T010 [US1] Exécuter le parcours dépôt → patch → 2 boots ; enregistrer les preuves dans .local/native-addition/ et quickstart.md.

## Phase 4 — US2 Historique

- [x] T011 [US2] Ajouter identité, sélection et transformation des ajouts dans src/editor/session.mjs et src/view/app.mjs ; tests de non-confusion avec la source.
- [x] T012 [US2] Vérifier Undo/Redo/Reset exacts et restauration après sauvegarde dans tests/editor-addition.test.mjs et tests/browser-catalog.mjs.

## Phase 5 — Validation

- [x] T013 Exécuter les suites SSA/MCP et compléter specs/005-native-object-addition/validation.md avec résultats et limites effectifs.

## Dépendances et parallélisation

T001 → T003 → T004 → T005 → T006 → T007..T010 → T011..T013. T002 est indépendant de la recherche moteur. La lecture des dumps (T004, agent de recherche) et l'étude de l'instrumentation (préparation T005, agent principal) peuvent progresser ensemble sans écriture partagée. MVP = US1 prouvé en jeu ; aucune fausse livraison sous forme de copie locale seule.

Résultat : premier périmètre terminé, preuves et limites dans [validation.md](validation.md). Les autres sources et capacités restent hors périmètre, sans activation implicite.

## Extension : compatibilité et validation par familles

- [x] T014 Définir les diagnostics/familles et tester les distinctions candidat, bloqué, technique et confirmé.
- [x] T015 Ajouter l'analyse de compatibilité au catalogue et à l'inspecteur, avec compteurs/filtres en anglais et résultats persistants.
- [x] T016 Implémenter une campagne bornée reproductible : groupes de sources, boot, vérifications par instance, captures, annulation et restauration du profil ; ne pas modifier la scène utilisateur.
- [x] T017 Exécuter la campagne sur 1_Coper, Barrel et Chompy ; consigner les observations et ouvrir seulement le périmètre confirmé. Barrel ouvert ; 1_Coper/Chompy restent en diagnostic de cycle de vie, pas en faux succès.
- [x] T018 Vérifier suites et interface, préserver la session ouverte, documenter comment connaître et tester une capacité. Voir compatibility.md et validation.md.
