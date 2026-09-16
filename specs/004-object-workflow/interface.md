# Interface inspirée de Unity — 2026-09-15

## Correctifs après utilisation

L'interface est désormais entièrement en anglais : navigation, catégories, inspecteur, aide, confirmations, statuts et erreurs de lancement. Les noms et chemins provenant des données du jeu restent inchangés. Les descriptions françaises ci-dessous relatent la première version de la disposition.

- [x] UI06 Dépôt par clic maintenu : pointerdown/move/up avec capture du pointeur sur le Projet, seuil de 5 px et aperçu à la position du curseur. Relâcher dans le canvas prépare le remplacement ; Échap, perte de capture/focus et abandon hors scène annulent sans édition. Un simple clic conserve la sélection. Le chemin HTML5 reste compatible, mais le geste souris ne dépend plus de son déclenchement par la fenêtre hôte.
- [x] UI07 Ajouter **Reset scene** dans la barre de la scène, avec confirmation. Restaurer l'état à l'ouverture en rejouant les annulations exactes des transformations et remplacements ; garder Redo, effacer la sélection, rétablir la visibilité initiale et recadrer le niveau. Détacher sauvegarde et patch de la session pour éviter de relancer un ancien résultat, sans supprimer les fichiers. Refuser pendant une opération ou un lancement Dolphin.
- [x] UI08 Traduire tous les textes de l'interface en anglais, y compris infobulles, accessibilité, dossiers et erreurs serveur. Les cartes **Copy** acceptent le dépôt ; **View only** expose le motif de refus par infobulle et dans la barre de statut au clic. Le filtre **Copyable** isole les sources admissibles.
- [x] UI09 Vérifier le geste avec des événements souris natifs du navigateur, depuis le nom et la miniature, deux destinations distinctes, Échap et abandon hors scène. Vérifier annulation du reset, reset exact après copie + déplacement + sauvegarde, préservation du fichier sauvegardé et récupération des deux éditions par Redo. Actualiser le serveur en conservant l'historique utilisateur.

Validation : **250/250 tests SSA et 6/6 tests MCP PASS**. Scénario Edge/WebGL complet avec entrées souris CDP, sans DragEvent synthétique, passé ; dépôt à deux positions distinctes, confirmations du remplacement inchangées, reset et Redo exacts. Disposition vérifiée à 1280×800 et langue anglaise contrôlée. Rapport et captures locaux : `.local/object-workflow/browser-1789509022615/` (`reset-confirmation.png`, `reset-complete.png`). Commande : `node tools/ssa-archive/tests/browser-catalog.mjs --no-patch` ; retirer l'option pour construire aussi le patch.

Le chemin HTML5 fonctionnait dans Edge isolé avec une séquence souris complète ; une cause unique dans toutes les fenêtres hôtes n'est pas établie. Le nouveau gestionnaire prend directement en charge le geste décrit. Il ne rend pas copiables les objets scriptés/inactifs dont la duplication reste non confirmée : les 48 sources copiables du tutoriel et les règles de remplacement restent identiques. Aucune recette d'archive modifiée, aucun nouveau test en jeu revendiqué. Serveur actualisé avec conservation vérifiée de la session `s_d58eb87d`, de sa sauvegarde, de son patch et de ses 44 Redo.

Demande : simplifier l'ensemble de l'éditeur, avec explorateur en bas, dossiers/catégories et sous-dossiers, noms puis prévisualisations 3D.

## Spécification

- Barre principale compacte pour outils de transformation, annulation, sauvegarde, patch et lancement.
- Hiérarchie des placements à gauche ; calques accessibles dans un onglet distinct. Scène centrale et inspecteur à droite, propriétés avant réglages du lancement.
- Panneau Projet en bas : arbre de catégories/sous-catégories, fil d'Ariane, recherche et filtres, grille de cartes avec nom au-dessus de l'aperçu 3D. La catégorie est un classement de navigation dérivé des noms/modèles, pas un parent moteur ou un dossier écrit sur disque.
- Miniatures produites à partir des meshes réellement décodés, cadrage automatique et cache par modèle ; géométrie absente signalée explicitement. Un renderer partagé, génération progressive des cartes visibles, aucun contexte WebGL par carte.
- Hauteur du panneau et taille des vignettes réglables, préférences locales. Sélection cohérente entre hiérarchie, scène et Projet. Glisser-déposer et confirmations du lot 1 préservés.
- Aucun changement de données du jeu ou de recette de patch. Aucun redémarrage du serveur ni reconstruction de l'historique requis.

Référence de disposition : [Unity — Project window, vue en deux colonnes](https://docs.unity.cn/Manual/ProjectView.html). Les noms restent au-dessus des aperçus conformément à la demande.

## Plan et tâches

- [x] UI01 Réorganiser index.html et ajouter workspace.css / workspace.mjs : panneaux, onglets et redimensionnement.
- [x] UI02 Ajouter classification pure dans asset-folders.mjs et grille/arbre dans catalog.mjs.
- [x] UI03 Produire les miniatures locales dans thumbnails.mjs ; chargement différé, cache et géométrie manquante.
- [x] UI04 Relier les sélections et préserver le dépôt, undo/redo, réglages et historique.
- [x] UI05 Vérifier arborescence, aperçus réels, redimensionnement, recherche, dépôt et absence de mutation de la session utilisateur ; mettre à jour le compte rendu.
- [x] UI10 Supprimer le bouton imbriqué dans les `summary` de dossiers ; utiliser le titre natif et vérifier sélection/repliement avec Espace et Entrée. Scénario Edge PASS dans `.local/object-workflow/browser-1789509766825` : aucun contrôle interactif imbriqué, aucune erreur navigateur. Le dépôt testé reste un remplacement ; l'ajout réel est suivi dans la spec 005.

## Acceptation

Sur le tutoriel, les 673 placements restent accessibles ; ouvrir Végétation puis Fleurs filtre correctement sans édition. Un tournesol possède une miniature non vide sous son nom. Sélection depuis la hiérarchie ou la scène met à jour l'inspecteur et les cartes. Le panneau bas se redimensionne sans canvas nul ; les contrôles restent accessibles à 1280×800. Dépôt puis undo/redo passent le scénario navigateur existant. Les octets de patch ne changent pas du fait de la refonte.

## Validation réalisée

- Suite SSA : **248/248 tests PASS**, y compris les nouveaux tests de partition des dossiers et les tests existants de l'inspecteur.
- Navigateur Edge/WebGL : 673 objets et 673 entrées de hiérarchie ; sous-dossier Végétation/Fleurs = 21 placements ; miniature du tournesol chargée sous le nom ; sélection synchronisée ; onglets, hauteur du Projet et barre supérieure vérifiés à 1280×800. Recherche mesurée à 4,2 ms.
- Scénario de dépôt complet : choix de victime, critiques, confirmation, nouvelle opération disponible, undo/redo exacts et rechargement des modèles. Aucune exception navigateur. Le scénario a utilisé une copie isolée et préparé son patch, sans lancer Dolphin. Les recettes de patch n'ont pas été modifiées par ce travail d'interface.
- Captures inspectées : `.local/object-workflow/browser-1789507926510/workspace-sunflower.png` et `workspace-1280.png`. Rapport dans ce dossier ; aucune image de jeu dans Git.
- Session ouverte préservée, vérifiée par `.local/object-workflow/check-live.mjs` : même identifiant, sauvegarde, patch, 0 éditions appliquées et 44 Redo. Aucun redémarrage du serveur nécessaire ; actualiser la page charge les nouveaux fichiers.

Les miniatures sont des aperçus gris de la géométrie déjà décodée : elles ne prétendent pas restituer les matériaux, animations ou assemblages pilotés par scripts. Les catégories peuvent être imparfaites pour les noms inconnus, qui restent accessibles dans Autres et par recherche.
