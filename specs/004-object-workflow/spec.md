# Feature Specification: Explorateur d'objets, import et accès direct aux niveaux

**Feature Branch**: `main` (dossier indépendant de la branche)

**Created**: 2026-09-15

**Status**: Lot 1 implémenté et validé le 2026-09-15 ; lots 2–3 documentés et planifiés, à réaliser. Voir [validation](validation.md).

**Évolution interface** : disposition inspirée de Unity, dossiers/sous-dossiers et miniatures 3D sous les noms, implémentés selon [interface.md](interface.md).

**Compléments demandés et implémentés** : clic maintenu depuis le Projet vers la scène avec aperçu suivant le pointeur ; bouton **Reset scene** avec confirmation, retour exact au fichier ouvert et Redo conservé ; interface entièrement en anglais, noms de données du jeu inchangés. Spécification et validation détaillées : UI06–UI09 dans [interface.md](interface.md).

**Input**: « 1: ajouter un explorateur avec les objects ou on peut drag and drop dans la scene
2: pouvoir importer des objects d'autre niveau dans d'autre scene 3: pouvoir charger directement n'importe
quelle niveau sans passer par le menu ect (documente tous toujours remplies les specs et note les étapes) ».
Précision : « Documenter les trois étapes et implémenter le premier lot ».

## User Scenarios & Testing

### User Story 1 — Explorer et déposer un objet du niveau (Priority: P1)

L'utilisateur trouve un objet par son nom, son modèle ou son calque, le sélectionne pour le retrouver dans
la scène, puis le glisse dans la scène pour préparer une copie à la position choisie. L'ajout disponible
aujourd'hui remplace un objet existant : son identité et les éventuels effets sur d'autres objets sont
montrés avant confirmation. Un dépôt annulé ne change rien.

**Why this priority**: Cette interaction rend la duplication déjà disponible utilisable sans saisir d'offsets.

**Independent Test**: Dans le tutoriel, rechercher une plante, la déposer sur le sol, choisir un objet compatible
à remplacer, vérifier l'aperçu et le bilan, confirmer, annuler, rétablir, sauvegarder et observer deux essais en jeu.

**Acceptance Scenarios**:

1. **Given** un niveau ouvert, **When** l'utilisateur filtre par nom, modèle ou calque, **Then** la liste et son
   compteur correspondent aux placements du niveau, y compris les objets cachés et ressources identifiés.
2. **Given** un résultat, **When** l'utilisateur le sélectionne, **Then** l'inspecteur montre cet objet et la vue
   le cadre en rendant son calque visible ; aucun objet n'est modifié.
3. **Given** une source duplicable, **When** elle est glissée sur une surface visible, **Then** un aperçu indique
   la position proposée ; aucun objet n'est remplacé tant que le choix et la confirmation ne sont pas faits.
4. **Given** un dépôt préparé, **When** l'utilisateur choisit une cible compatible, **Then** le bilan nomme la cible
   supprimée et les autres objets affectés. Les conséquences critiques exigent un accord explicite.
5. **Given** un bilan accepté, **When** l'utilisateur confirme, **Then** une seule opération remplace la cible,
   la source reste en place, l'affichage et l'inspecteur correspondent aux données sauvegardables.
6. **Given** une copie confirmée, **When** l'utilisateur annule puis rétablit, **Then** les données et modèles
   affichés retrouvent exactement leur état précédent puis leur état modifié.
7. **Given** une source non prise en charge, aucun emplacement compatible, un dépôt hors scène ou une session
   occupée par Dolphin, **When** un dépôt est tenté, **Then** le motif est visible et aucune modification n'est faite.

### User Story 2 — Importer depuis un autre niveau (Priority: P2)

L'utilisateur choisit un objet d'un niveau source et connaît sa compatibilité avec le niveau cible avant l'import.
Un import réel inclut les ressources nécessaires à l'objet ; une simple correspondance avec un objet déjà présent
dans la cible est présentée comme une réutilisation locale, jamais comme un import réussi.

**Why this priority**: Réutiliser le catalogue du jeu élargit les possibilités de création après stabilisation du dépôt.

**Independent Test**: Choisir un objet source absent de la cible, importer ses ressources sans altérer le niveau source,
puis observer son rendu dans deux lancements identiques du niveau cible. Les comportements et collisions restent
des capacités distinctes et ne sont pas présumés par le rendu.

**Acceptance Scenarios**:

1. **Given** deux niveaux indexés, **When** un objet source est choisi, **Then** le diagnostic distingue les ressources
   présentes, absentes et non comprises, avec un motif pour chaque import indisponible.
2. **Given** une correspondance locale, **When** elle est choisie, **Then** le produit annonce une réutilisation du
   modèle cible et conserve ses limitations ; aucune donnée étrangère n'est injectée silencieusement.
3. **Given** une recette d'import vérifiée, **When** l'import est confirmé, **Then** l'objet est visible dans le niveau
   cible, toutes ses dépendances nécessaires sont résolues et les sources restent inchangées.
4. **Given** une dépendance inconnue, **When** l'utilisateur tente l'import, **Then** l'écriture est indisponible et
   le diagnostic reste consultable. Les cas non pris en charge ne sont pas masqués du catalogue.

### User Story 3 — Démarrer directement le niveau choisi (Priority: P3)

L'utilisateur choisit le niveau édité et arrive dans une scène jouable sans action dans les menus. La cible produit
reste l'ensemble des niveaux jouables du jeu. Les niveaux validés et ceux encore sans méthode sont distingués.

**Why this priority**: Réduire l'attente entre édition et observation sans rendre invisibles les dernières modifications.

**Independent Test**: Sur le tutoriel puis un autre chapitre, lancer le niveau choisi sans action dans les menus,
observer une modification propre au patch courant, et recommencer après un nouveau patch.

**Acceptance Scenarios**:

1. **Given** un niveau dont le démarrage direct a été vérifié, **When** il est lancé, **Then** la scène jouable
   correspond à ce niveau et à la version courante du patch, sans manipulation des menus.
2. **Given** une nouvelle modification, **When** le démarrage utilise un état antérieur incompatible, **Then** cet
   état est rejeté ou reconstruit ; les anciennes données ne remplacent pas silencieusement la modification.
3. **Given** un niveau non encore validé, **When** il est choisi, **Then** son indisponibilité et la méthode de
   repli existante sont annoncées ; le tutoriel ne démarre pas sous l'étiquette d'un autre chapitre.

### Edge Cases

- Noms identiques, ressource inactive, objet sans modèle, script dépendant du contexte, modèle partagé.
- Niveau sans carte de pointeurs validée, objet sans emplacement compatible, cible devenue différente après préparation.
- Dépôt dans le ciel : plan horizontal explicite à hauteur réglable, sans prétendre détecter une collision du jeu.
- Calques cachés, décor en filaire, redimensionnement, survol de l'interface, abandon du glisser-déposer, touche Échap.
- Annulation d'un remplacement qui change un modèle partagé : reconstruire tous les objets visuellement affectés.
- Fichier source/cible modifié pendant un import, dépendances cycliques, indice de type différent selon le niveau.
- État rapide provenant d'un autre patch, autre version du jeu ou autre Dolphin ; niveau pas encore visité.

## Requirements

### Functional Requirements

- **FR-001**: L'explorateur doit lister tous les placements du niveau courant avec nom, modèle, calques et disponibilité du dépôt.
- **FR-002**: La recherche doit filtrer sans tenir compte de la casse et proposer les catégories tous, duplicables,
  scriptés et ressources/objets désactivés, avec compteur et état vide explicites.
- **FR-003**: La sélection d'un résultat doit retrouver et cadrer le placement sans modifier les données.
- **FR-004**: Le dépôt doit proposer une position sur une surface visible ou sur un plan horizontal réglable et
  montrer un aperçu temporaire distinct des objets enregistrés.
- **FR-005**: Le lot 1 doit réutiliser un emplacement existant compatible. L'utilisateur doit choisir et confirmer
  l'objet remplacé ; aucune cible n'est sacrifiée automatiquement.
- **FR-006**: Le bilan doit montrer toutes les conséquences connues, bloquer les opérations invalides et exiger
  l'accord prévu pour les conséquences critiques. Une préparation périmée doit être refusée.
- **FR-007**: Une copie confirmée doit être une seule opération annulable ; abandon, erreur et refus doivent conserver
  les données, l'historique et la dernière sauvegarde.
- **FR-008**: La source ne doit pas être déplacée lors du dépôt. Une source scriptée, inactive ou non visible non
  prise en charge doit rester consultable avec explication ; ce lot n'active aucun nouveau comportement.
- **FR-009**: L'affichage doit être reconstruit après remplacement, annulation et rétablissement pour refléter modèles,
  ressources partagées, sélection, calques et disponibilités courants.
- **FR-010**: Les commandes de dépôt doivent être indisponibles pendant un lancement Dolphin ou une autre opération en cours.
- **FR-011**: Le futur catalogue multi-niveaux doit identifier sans ambiguïté niveau et objet source ; aucun chemin arbitraire
  fourni par glisser-déposer ne doit provoquer une lecture ou une écriture hors des sources configurées.
- **FR-012**: Le futur import doit inventorier les dépendances, distinguer réutilisation locale et transfert réel, et
  n'écrire que via une recette prouvée pour les dépendances concernées.
- **FR-013**: Le futur démarrage direct doit vérifier identité du niveau, version du patch consommé et scène jouable ;
  un écran de chargement ou une connexion réussie ne vaut pas validation.
- **FR-014**: Les états rapides doivent être associés à leurs entrées exactes et ne jamais servir à démontrer le chargement
  d'un nouveau patch dont les données sont déjà résidentes dans l'ancien état.
- **FR-015**: Chaque lot doit documenter décisions, limites, tests, expériences et tâches réellement terminées. Données du
  jeu et preuves visuelles restent locales ; le WBFS et le Dolphin personnel sont préservés.

### Key Entities

- **Objet du catalogue** : placement identifié dans un niveau, nom, représentation, origine et capacités disponibles.
- **Dépôt préparé** : source, position proposée, cible choisie, conséquences et version des données analysées.
- **Diagnostic d'import** : objet source/cible, dépendances et verdicts de compatibilité avec leurs preuves.
- **Profil de démarrage d'un niveau** : cible, méthode validée, entrées exactes, preuves et limitations.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Sur le tutoriel, 100 % des placements sont accessibles dans l'explorateur ; la recherche d'un nom connu
  et sa sélection prennent moins de 30 secondes, et le filtre répond en moins de 300 ms sur le poste de référence.
- **SC-002**: Dépôt, abandon, confirmation, annulation et rétablissement passent les scénarios de bout en bout ; aucune
  donnée ne change avant confirmation et une copie produit exactement une opération d'historique.
- **SC-003**: Deux lancements du même patch montrent la copie attendue à la position choisie, avec remplacement consommé
  et scène jouable ; les autres différences connues correspondent au bilan accepté.
- **SC-004**: L'import réel n'est annoncé disponible qu'après un objet absent de la cible rendu dans deux essais identiques,
  sans dépendance nécessaire laissée inconnue ; collision et comportement ont leur propre statut.
- **SC-005**: Le démarrage direct n'est annoncé pour un niveau qu'après deux arrivées jouables sans action de menu, dont
  la méthode démontre aussi l'utilisation d'un patch modifié ; au moins deux chapitres sont exigés avant généralisation.
- **SC-006**: Toutes les tâches comportent un état vérifiable ; aucune tâche de recherche n'est marquée comme une capacité livrée.

## Assumptions

- Le premier lot utilise les objets du niveau ouvert, avec les recettes de duplication déjà validées ; l'ajout sans
  remplacement reste un objectif séparé, non déguisé par l'interface.
- Les lots 2 et 3 sont spécifiés et étudiés dans cette livraison, pas implémentés. Les inconnues techniques sont des
  étapes de recherche explicites, pas des questions de préférence laissées à l'utilisateur.
- Le glisser-déposer cible la souris sur Windows ; une sélection de catalogue et un dépôt préparé ne lancent pas le jeu.
- La pose initiale proposée conserve le cap et l'échelle de la source ; le sol graphique n'est pas une preuve de collision.
- Le catalogue n'implique ni simulation des scripts ni prise en charge des ressources actuellement cachées.
