# Patch, lancement et déplacements scriptés

Mise à jour du 15 septembre 2026.

Dans l’éditeur, **Patch** sauvegarde les modifications courantes, reconstruit l’archive originale autour de
l’entrée IGZ modifiée, puis redécode cette entrée pour vérifier l’égalité exacte avec la sauvegarde. Le lancement
utilise ce même patch. Une modification postérieure ou un remplacement altéré impose une nouvelle reconstruction.
L’ancien bouton Patch copiait à tort l’entrée décodée à la place de l’archive entière ; l’ancien lancement
reconstruisait séparément un autre patch. Ces deux chemins sont remplacés par une seule chaîne.

Le choix « Lancer automatiquement après le patch » est activé par défaut. Deux modes sont proposés :

- **Test du tutoriel, puis fermer Dolphin** : charger la figurine configurée, passer les menus, atteindre le
  tutoriel et déplacer le Skylander à droite puis à gauche. Captures et rapport local, puis fermeture du Dolphin
  possédé. Macro disponible pour `Level_027_Tutorial` seulement, durée habituelle autour de cinq minutes.
- **Jeu classique** : ouvrir le patch, charger la figurine, laisser les menus et les commandes au joueur.
  Le bouton **Arrêter** ferme le Dolphin possédé ; fermer Dolphin manuellement termine aussi la session.

La figurine vient de `--figure`, de `.local/dolphin-config.json` (`figure`) ou de la source validée dans la preuve
M0. Le MCP expose seulement une copie de la figurine au jeu. Le WBFS et le Dolphin personnel restent préservés.
Les rapports sont sous `.local/dolphin-evidence/editor-runs/`, les captures sous `.local/dolphin-evidence/`.
Un échec `spawn EPERM` ou `spawn EACCES` avant le démarrage du MCP/Dolphin signifie que la création du processus
est refusée. Le serveur de l'éditeur doit lui-même être lancé depuis un terminal Windows autorisé à créer des
processus : un serveur démarré dans un environnement restreint transmet ses restrictions aux lancements suivants.
Redémarrer seulement le navigateur ne change pas ces permissions. Conserver la session et son historique avant
de redémarrer le serveur ; le patch déjà sauvegardé n'a pas besoin d'être reconstruit. Les rapports indiquent
désormais l'étape en échec, le code système et l'erreur initiale. Aucun contournement automatique des permissions.
Une macro terminée et une consommation du fichier prouvée ne constituent pas une validation automatique de l’effet
visuel. Les nouveaux modes sont des aperçus, pas des promotions de gates M4/M5.

## Déplacement d’une île qui revenait à sa position

`Drifting_Piece_ID1` ne suit pas uniquement son point de placement : `Drifting_Piece.ai` l’anime sur une trajectoire
privée de trois points. Le contrôle avec l’ancre seule chargeait effectivement les nouvelles coordonnées dans la
RAM, mais l’utilisateur ne voyait pas le déplacement attendu. La translation des trois points avec l’ancre a rendu
le déplacement visible, confirmé par l’utilisateur puis reproduit sur un second démarrage du même patch.

L’éditeur translate désormais ces points avec la position. Annuler/rétablir et le plan de sauvegarde couvrent tous
les mots modifiés. Cette capacité reste limitée au format confirmé du tutoriel, avec pointeurs runtime connus et
trajectoire privée. La rotation, les autres scripts et les collisions ne sont pas déduits de ce résultat.
Voir le finding `level.drifting-piece.waypoint-translation`.

## Ponts et canons

Le pont au départ est généré par `Bridge_Spawner.ai` (placement `Dock`, ressource `Template_Dock_whole`) ; le
placement nommé `First_Bridge` utilise aussi ce script avec `Template_Bridge_whole`. Les ressources étaient déjà
décodées mais apparaissaient à leurs coordonnées de modèle. Le calque **Ponts et canons · aperçu** assemble les
ressources au point du générateur. Le relevé des matrices dans Dolphin corrige le décalage de 90° des ponts.
Les aperçus restent LIKELY en lecture seule, sans destruction ni animation.

L’inspecteur liste les ressources référencées par les instructions `clone` et indique les objets utilisés comme
modèles. Le haut du canon `Push_Canon_Art_Top` est lui-même un modèle utilisé par `PushBlock_Template.ai` et son
script crée d’autres éléments. Le haut et le socle sont assemblés aux trois contrôleurs ID 10 du tutoriel ; la
pose du premier est comparée aux acteurs dans Dolphin. Les états ultérieurs ne sont pas simulés.
Un marqueur sans modèle direct n’est plus présenté comme nécessairement invisible.

Les ressources et objets initialement désactivés sont réunis dans un calque désactivé par défaut. Pour le
trésor Ancient Shell, l'inspecteur du modèle propose l'objet `(1)` effectivement placé sur le ponton.
Voir [les poses et leur preuve](editor-scene-poses.md).

Validation locale : tests SSA, tests MCP, vérification WebGL dans Edge isolé, boutons de lancement avec un runner
simulé ; essais réels du test automatique, du mode classique et de son arrêt, puis deux essais de la trajectoire.

## Vérification du correctif `spawn EPERM`, 15 septembre 2026

Le serveur de l'éditeur avait été démarré dans l'environnement restreint et refusait de créer le processus MCP
avant tout lancement de Dolphin. Après redémarrage autorisé du serveur, le test a été lancé via `/api/launch`
sur le patch utilisateur existant `edit-3-level.bld-1789489608180`, sans reconstruire ni modifier ses données.
Les 29 états de l'historique ont été restaurés avec contrôle des octets ; sauvegarde SHA256
`704c62f0fd429cba60a810282ffc2d584ba78958dc3c407671fc3d3d269383a9` conservée.

Résultat `editor-test-1789489881698-57dc88f4` : `MACRO_COMPLETED`, 17 captures, Sonic Boom dans le tutoriel,
FileMon **15 333 kB** confirmant la consommation du remplacement, puis fermeture normale du PID Dolphin 18192
(`forced: false`). L'éditeur est déverrouillé, avec la même sauvegarde, le même patch et les 29 opérations.
Rapport local : `.local/dolphin-evidence/editor-runs/editor-test-1789489881698-57dc88f4.json` ; comparaison de session :
`.local/script-remediation/editor-eperm-verification.json`. Tests : **238 SSA + 6 MCP**, tous réussis.
Ce contrôle valide le lancement et la macro ; il ne juge pas automatiquement chaque modification visuelle du patch.
Après ce contrôle, l'utilisateur confirme que tout fonctionne et que ses modifications sont présentes en jeu.
