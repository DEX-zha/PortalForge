# Vérification

1. Dans Objets, rechercher une plante puis cliquer pour révéler et cadrer.
2. Glisser une source disponible sur la scène. Vérifier fantôme, coordonnées et altitude de secours réglable. Échap ou dépôt hors scène annule.
3. Choisir l'objet remplacé ; lire le plan et acquitter chaque critique. Aucune édition avant confirmation.
4. Confirmer : source conservée, copie déposée, une édition. Undo/redo restaurent tous les modèles affectés.
5. Tester refus script/inactif, sans carte runtime, plan périmé et verrouillage. Ces objets restent sélectionnables.
6. Sauvegarder/patcher dans un espace isolé, comparer les octets reconstruits ; deux boots identiques avec consommation FileMonitor/RAM, résultat visuel et jouabilité. Preuves dans .local/.

npm test dans tools/ssa-archive et tools/dolphin-mcp. Navigateur dédié, session utilisateur préservée. Lots 2/3 : [recherche](research.md). Un état créé dans le niveau chargé ne recharge pas automatiquement les ressources modifiées.

Contrôle WebGL reproductible depuis la racine : `node tools/ssa-archive/tests/browser-catalog.mjs`. Prérequis : Windows avec Edge, échantillon Tutorial sous `.local/workspaces/tutorial-bld/entries/3-level.bld.decoded`, carte `.local/dolphin-evidence/ptr-scan3-fixups.json`, archive originale extraite et configuration Dolphin habituelle. Le script ouvre une session isolée, utilise les événements HTML5 de dépôt, contrôle les octets et prépare un patch ; il ne lance pas Dolphin. Résultats et captures dans `.local/object-workflow/browser-*/`, dernier rapport dans `.local/object-workflow/latest-browser.json`.

Pour utiliser le lot livré : actualiser `http://127.0.0.1:7400/`, rechercher une source **Copiable**, la glisser dans la scène, choisir la victime et confirmer le plan. Le dépôt copie l'objet ; il ne crée pas un emplacement supplémentaire.
