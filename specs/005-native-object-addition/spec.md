# Feature Specification: Ajout réel d'objets supplémentaires

**Feature Branch**: `main` (dossier indépendant de la branche)
**Created**: 2026-09-16
**Status**: Premier périmètre implémenté et validé ; parcours éditeur → patch → deux boots PASS. Voir validation.md.
**Input**: Glisser un objet du Project dans la Scene comme Unity pour créer une instance supplémentaire devant la caméra. Choix explicite : « Ajout réel dans le jeu », pas de copie réservée à l'éditeur.

## User Scenarios & Testing

### User Story 1 — Ajouter sans sacrifier (Priority: P1)

L'utilisateur dépose une décoration du niveau courant dans la scène, puis la retrouve en jeu en plus des objets déjà présents.

**Why this priority**: Le remplacement actuel ne satisfait pas le besoin d'ajout.
**Independent Test**: Déposer un tournesol près du départ du tutoriel ; sauvegarder, patcher et démarrer deux fois. La copie et les deux tournesols d'origine doivent coexister, avec la mauvaise herbe et les autres objets inchangés.

**Acceptance Scenarios**:
1. **Given** un objet pris en charge, **When** il est déposé sur une surface visible, **Then** une instance distincte apparaît au point choisi, la source restant en place.
2. **Given** un ajout enregistré, **When** le niveau démarre, **Then** l'instance supplémentaire est visible à la destination et aucune instance existante n'a été remplacée.
3. **Given** une catégorie non prise en charge, **When** l'utilisateur tente un ajout, **Then** la raison apparaît en anglais sans modification silencieuse.

### User Story 2 — Modifier et annuler l'ajout (Priority: P2)

L'instance ajoutée peut être sélectionnée et déplacée ; Undo, Redo et Reset scene restaurent les états attendus.

**Independent Test**: Ajouter, déplacer, annuler deux fois et rétablir deux fois ; le résultat enregistré correspond exactement à l'état affiché. Reset scene revient au niveau ouvert.

### Edge Cases

- Dépôt hors scène, Échap, source indisponible : aucune création.
- Aucune surface sous le pointeur : plan de placement explicite ; pas de coordonnées invalides.
- Réouverture, changement de patch ou nouveau niveau : pas de copie issue d'un ancien état mémoire.
- Source scriptée, inactive ou sans géométrie confirmée : refus explicite tant que cette catégorie n'est pas validée.
- Limite d'instances ou échec du chargement : refus compréhensible, aucun sacrifice automatique.

## Requirements

### Functional Requirements

- **FR-001** : Un ajout augmente d'une unité le nombre d'instances visées dans la scène jouable, sans remplacement.
- **FR-002** : Le dépôt conserve la source, son apparence et ses propriétés ; la destination correspond au point choisi dans la scène.
- **FR-003** : Les ajouts enregistrés survivent au parcours sauvegarde → patch → démarrage à froid.
- **FR-004** : Les instances ajoutées ont une identité distincte, une sélection et un historique réversible.
- **FR-005** : Aucune catégorie non validée n'est présentée comme ajoutable au jeu ; aucune copie limitée à l'éditeur ne tient lieu de résultat.
- **FR-006** : Les données originales, la session ouverte et le Dolphin personnel sont préservés.
- **FR-007** : Les textes de l'interface restent anglais et les dossiers fonctionnent au clavier sans contrôles imbriqués dans leurs titres.
- **FR-008** : Les preuves identifient le résultat attendu, le patch réellement consommé et la conservation des objets témoins sur deux démarrages identiques.

### Key Entities

- **Source** : objet existant du niveau dont la création est validée pour le jeu concerné.
- **Ajout** : identité nouvelle, source, destination, orientation et échelle ; indépendant d'une victime.
- **Preuve** : entrée, patch, observations du résultat et témoins préservés.

## Success Criteria

- **SC-001** : Un dépôt produit une instance supplémentaire visible en jeu lors de 2/2 démarrages identiques.
- **SC-002** : Les deux objets sources/témoins et la mauvaise herbe initiale restent présents ; aucun objet sacrifié.
- **SC-003** : Undo/Redo/Reset reproduisent exactement les états attendus, y compris après déplacement d'une copie.
- **SC-004** : Les dossiers se sélectionnent et se replient avec Espace et Entrée, sans avertissement de contrôle interactif imbriqué.

## Assumptions

## Extension demandée le 2026-09-16 : diagnostic et essais réutilisables

L'utilisateur demande d'élargir aux pièces `1_Coper`, barrels et Chompies et de savoir pourquoi un objet est ajoutable ou non, sans dépendre d'un examen manuel intégral pour chaque objet.

- **FR-009** : analyser tous les objets en une passe et afficher une famille de compatibilité, les contrôles satisfaits et les obstacles concrets. Un script présent ne signifie pas automatiquement incompatible.
- **FR-010** : séparer Confirmed, Needs test, Needs script test, Runtime passed / visual pending et Blocked. Les états candidats ne sont pas des promesses d'ajout réussi.
- **FR-011** : proposer un test en lot qui choisit des représentants de familles, réalise les boots, vérifie les instances natives, conserve captures/échecs et réutilise les résultats pour les mêmes ressources/recettes. Aucune promotion par simple ressemblance de nom ou simple boot.
- **FR-012** : identifier explicitement les résultats du test des trois familles demandées. La visibilité et le comportement (collecte, destruction, combat) restent des dimensions séparées ; une allocation réussie n'autorise pas à déclarer le gameplay validé.

Acceptation : recherche `Barrel`, `1_Coper`, `Chompy` → diagnostic explicite ; campagne reproductible sans modifier la scène utilisateur ; résultats persistés avec empreintes et consultation depuis l'éditeur. Étendre Add uniquement là où la preuve le permet.

Priorité suivante : expliquer et corriger la différence entre déplacement d'un ennemi/loot existant et ajout d'une copie. Tester séparément les hypothèses de paramètres partagés, identité, contexte d'activation et disparition liée au déroulement de la macro. Une solution doit garder le script d'origine, produire une instance distincte visible sur deux boots identiques et préserver les originaux. Le partage d'un script n'est pas considéré fautif sans preuve.

- Premier périmètre : décoration statique déjà disponible dans le tutoriel ; import inter-niveaux, nouvelles géométries et nouvelles collisions hors périmètre.
- Périmètre confirmé : SSPP52 Rev1, tutoriel, tournesol source3446244, Barrel3983352, Enemy_ChompyNipper2390540 et 1_Coper(1)3034548, au plus deux ajouts au total par démarrage à froid, position/orientation, échelle d'origine100%. Les scripts et distances d'activation sont conservés ; la création visible ne garantit pas la survie pendant la macro. Les autres modèles et paramètres restent à valider.
- Les gates existantes autorisent le remplacement confirmé, pas une insertion arbitraire. Les expérimentations se font dans les profils locaux dédiés.
