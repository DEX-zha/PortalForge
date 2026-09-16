# Utilisation et validation

1. Ouvrir le tutoriel avec sa runtime map ; actualiser l'éditeur après mise à jour du serveur.
2. Dans Project, rechercher `sunflower`, `Barrel`, `Enemy_ChompyNipper` ou `1_Coper(1)`. Les quatre sources exactes validées portent **Add** ; le filtre **Can add** les regroupe. Les autres entrées affichent leur diagnostic, détaillé dans l'inspecteur.
3. Maintenir le clic sur la miniature ou le nom, déplacer vers la scène et relâcher. Le point suit la surface visible, ou le plan horizontal en l'absence de surface. Aucun choix d'objet à remplacer.
4. La nouvelle entrée `(Copy 1)` se sélectionne dans la hiérarchie. Move et Orientation fonctionnent ; Scale reste100%. Deux copies maximum dans cette première recette.
5. Save conserve le niveau et `<fichier>.portalforge.json`. Garder les deux fichiers ensemble. Patch construit l'archive et son accompagnement Gecko. Le bouton de lancement de l'éditeur installe automatiquement ce dernier pour la session Dolphin dédiée.
6. Choisir le test automatique pour sélectionner la figurine, atteindre le tutoriel et fermer Dolphin, ou le jeu classique pour jouer manuellement. Après rechargement du niveau, arrêter puis relancer l'émulation pour recréer les ajouts.
7. Undo/Redo affectent les copies distinctes ; Reset scene revient au niveau ouvert et conserve l'historique récupérable. Une réouverture d'un fichier enregistré restaure ses ajouts associés.

Le descripteur Riivolution seul ne suffit pas pour les ajouts : passer par le lanceur de l'éditeur. Périmètre : **SSPP52 Rev1, tutoriel, tournesol3446244, Barrel3983352, Chompy2390540 et pièce3034548, deux copies au total, position/orientation, scale100**. Les objets conservent leurs scripts et distances d'activation : ils peuvent bouger ou disparaître pendant le jeu. La collecte et le combat ne sont pas déclarés entièrement validés. Régénérer les anciens patches d'ajouts scriptés avec cette version de l'éditeur.

Pour tester une autre source, utiliser **Test selected** ou **Test next 2 types**. Deux boots automatiques, vérifications mémoire intermédiaires, captures et rapport local ; **Stop test** interrompt la campagne. Consulter [compatibility.md](compatibility.md) pour les états, les familles et les limites. Les autres membres d'une famille restent à valider individuellement.

Contrôles : `npm test` dans `tools/ssa-archive` et `tools/dolphin-mcp`. Depuis la racine, `node tools/ssa-archive/tests/browser-catalog.mjs` vérifie les vrais gestes souris, dossiers clavier, hiérarchie, rotation, historique, sauvegarde et construction du patch dans un répertoire `.local/` isolé. Ce test nécessite les données locales du tutoriel et Edge ; il ne lance pas Dolphin.

Deux boots du patch produit par ce scénario ont été validés : voir [validation.md](validation.md). Les données, captures et rapports détaillés restent locaux.

Les options `--barrel`, `--chompy` et `--coin` de ce test navigateur sélectionnent la source, avec sauvegarde/réouverture du script et génération du patch.
