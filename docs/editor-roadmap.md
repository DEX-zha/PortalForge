# Prochaines étapes de l'éditeur

Demande 2026-09-15 : trois lots documentés, premier à implémenter.
[Spec](../specs/004-object-workflow/spec.md) · [Plan](../specs/004-object-workflow/plan.md) · [Tâches](../specs/004-object-workflow/tasks.md) · [Recherche](../specs/004-object-workflow/research.md)

| Étape | Résultat | Limite / preuve |
|---|---|---|
| 1 — Explorateur et glisser-déposer | Rechercher, cadrer, déposer une copie, confirmer et undo/redo | Emplacement compatible remplacé explicitement ; sources scriptées/inactives exclues ; deux boots et contrôle visuel |
| 2 — Objets d'autres niveaux | Catalogue externe, diagnostic puis import | Réutilisation locale distincte du vrai import ; nouvelles ressources M4A, collision M4B, comportements M5 |
| 3 — Accès direct aux niveaux | Entrée sans parcours manuel des menus | Stratégie validée par niveau ; cache invalidé si patch modifié ; identité et nouvelle lecture observées |

État des travaux/validations dans les tâches. M0–M3 PASS ; M4A/M4B/M5 UNKNOWN. Données, sauvegardes et captures restent locales.

2026-09-16 : le dépôt du Project utilise désormais l'ajout natif confirmé, sans victime, pour le tournesol du tutoriel (deux copies, Move/Rotate, taille100%). Le parcours navigateur → sauvegarde → patch → deux boots est PASS. Les autres sources restent à valider. [Périmètre et preuves](../specs/005-native-object-addition/validation.md) · [Utilisation](../specs/005-native-object-addition/quickstart.md). Les lots2 et3 restent documentés, non implémentés.

Lot 1 livré le 2026-09-15 : 673 placements du tutoriel accessibles, dépôt avec aperçu et confirmation, plans périmés refusés, undo/redo et géométrie partagée actualisés. Validation : 246 tests SSA + 6 MCP, navigateur WebGL, deux boots identiques avec consommation et résultat visuel. [Compte rendu](../specs/004-object-workflow/validation.md). Les lots 2 et 3 restent au stade documenté.

Interface améliorée ensuite : organisation inspirée de Unity avec Hiérarchie / Scène / Inspecteur, Projet inférieur redimensionnable, catégories et sous-catégories, noms au-dessus de miniatures 3D réelles, recherche et taille des cartes réglable. [Specs, tâches et validation de l'interface](../specs/004-object-workflow/interface.md) : 248 tests SSA et scénario WebGL complet, dont disposition 1280×800.

Extension du 2026-09-16 : Barrel, Enemy_ChompyNipper et 1_Coper(1) ajoutés aux sources natives confirmées, avec le tournesol. La création scriptée attend désormais le système d'activation ; les copies précoces étaient désactivées avant le tutoriel. Project affiche les diagnostics et propose des tests automatiques par famille (234 familles testables), avec captures intermédiaires et résultats persistants. Validation : deux boots identiques Chompy/pièce, 271 tests SSA et 6 MCP. Scripts, IDs, distances et états propres sont conservés ; la création visible reste distincte du gameplay et de la survie finale. [Guide des diagnostics et campagnes](../specs/005-native-object-addition/compatibility.md).
