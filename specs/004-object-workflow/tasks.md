# Tâches — workflow objets

Portée courante : T001–T009 (US1). T010–T017 sont le backlog documenté des lots futurs, sans autorisation d'implémentation dans ce lot.

Évolution demandée ensuite : [refonte de l'interface](interface.md), UI01–UI05 réalisées et validées (Projet en bas, catégories, miniatures 3D, inspecteur simplifié).

Demandes complémentaires : UI06–UI09 terminées dans [interface.md](interface.md) : dépôt avec capture du pointeur, Reset scene réversible et interface entièrement anglaise. Validation : 250 tests SSA, 6 tests MCP et scénario souris réel Edge avec reset/Redo. US2/US3 restent le backlog ci-dessous.

## Préparation

- [x] T001 Documenter les trois étapes dans specs/004-object-workflow/{spec,plan,research,data-model,quickstart}.md et contracts/editor-workflow.md ; vérifier gates et checklist.

## US1 — Explorateur et dépôt

- [x] T002 [US1] Ajouter tests de catalogue, transaction sans mutation, acquittements, péremption, verrouillage et undo/redo exacts dans tools/ssa-archive/tests/editor-catalog.test.mjs (FR001–008, SC001–002).
- [x] T003 [US1] Implémenter tools/ssa-archive/src/editor/catalog.mjs et routes server.mjs ; corriger planReplace dans session.mjs (FR001/005–008).
- [x] T004 [US1] Implémenter recherche, catégories, sélection et confirmation dans tools/ssa-archive/src/view/catalog.mjs et index.html (FR001–003/005–008).
- [x] T005 [US1] Ajouter intersection et aperçu de dépôt dans tools/ssa-archive/src/view/scene.mjs ; annulation et plan de secours (FR004).
- [x] T006 [US1] Intégrer reconstruction après replace/undo/redo et verrouillage dans tools/ssa-archive/src/view/app.mjs / src/editor/session.mjs ; conserver la géométrie locale dans src/editor/meshes.mjs et vérifier tests/editor-meshes.test.mjs (FR009–010).
- [x] T007 [US1] Passer les suites SSA/MCP et scénario navigateur réel ; consigner dans specs/004-object-workflow/validation.md (SC001–002).
- [x] T008 [US1] Vérifier même patch dans deux boots Dolphin avec consommation et rendu observés ; preuves .local/ et compte rendu specs/004-object-workflow/validation.md (SC003).
- [x] T009 [US1] Préserver puis actualiser l'éditeur utilisateur et finaliser docs/editor-roadmap.md / tâches (FR015/SC006).

## US2 — Import inter-niveaux, futur

- [ ] T010 [US2] Catalogue externe en lecture seule et provenance par niveau dans src/editor/import-catalog.mjs (FR011).
- [ ] T011 [US2] Rapport de dépendances et compatibilité dans src/editor/import-plan.mjs, sans writer nouveau (FR012).
- [ ] T012 [US2] Réutilisation explicite d'un modèle présent dans la cible, via instance locale et recette confirmée ; tests et deux boots (FR012).
- [ ] T013 [US2] Rechercher fermeture/remappage d'une décoration absente, preuves M4A avant writer ; collision M4B et comportement M5 séparés, findings sources dans docs/findings/records (SC004).

## US3 — Entrée directe, futur

- [ ] T014 [US3] Inventorier transitions avant chargement et identités niveau/état/jeu/runtime/configuration dans src/editor/level-entry.mjs (FR013–014).
- [ ] T015 [US3] Protocole tutoriel sans anciens octets RAM, deux arrivées et nouveau patch visible ; preuves .local/ (SC005).
- [ ] T016 [US3] Étendre Mining puis autre famille et matrice docs/level-entry-status.json ; aucun fallback silencieux (FR013/SC005).
- [ ] T017 [US3] Exposer seulement stratégies prouvées dans l'éditeur et invalidation des caches ; tests des incompatibilités (FR014).

## Dépendances et stratégie

T001 → T002 → T003 → T004/T005 → T006 → T007 → T008 → T009. T004 et T005 portent sur des fichiers distincts mais s'intègrent avant validation. MVP = US1 complet. US2 : T010 → T011 → T012, T013 soumis aux gates. US3 : T014 → T015 → T016 → T017. Les preuves des lots futurs sont indépendantes ; aucun statut PASS déduit d'une interface ou d'un démarrage seul.
