# Poses des ponts, canons et objets modèles du tutoriel

Le rendu du 15 septembre 2026 corrige les instances initiales de deux ponts et de trois
canons. Les scripts restent responsables de leurs animations et changements ultérieurs.
Ce travail concerne l'aperçu : aucun octet du niveau n'est modifié et aucune propriété
supplémentaire n'est rendue éditable.

## Comparaison avec Dolphin

La macro du profil de recherche atteint le tutoriel jouable dans
`scene-pose-1789424358122`. Le remplacement est celui déjà validé pour le déplacement
de `Drifting_Piece_ID1`. Les lectures MEM1/MEM2, captures et lignes FileMon restent sous
`.local/mesh-coverage-study/scene-pose/` et `.local/dolphin-evidence/`.
Le processus Dolphin possédé a été fermé normalement après les lectures.

La base de relocation des objets est `0x80DBC020`. Les objets créés ont des pointeurs
vers leur modèle de placement et leur créateur : cela distingue leurs matrices de
celles des contrôleurs et des ressources stockées dans l'archive.

| Créateur | Ressource | Position initiale | Rotation Y du modèle |
| --- | --- | --- | --- |
| `Dock`, 1776460 | `Template_Dock_whole`, 1783120 | 65.227203, 14.862352, 14.630400 | 314° = 44° − 90° |
| `First_Bridge`, 1875316 | `Template_Bridge_whole`, 1777576 | −6.096000, 5.473598, −19.964399 | 316° = 46° − 90° |
| `Push_Block_Template(1)`, 2302624 | `Push_Canon_Art_Top`, 2155316 | 11.715400, 2.629722, 40.915741 | 156° |
| Même contrôleur | `Push_Canon_Art_Bottom`, 2169700 | Même position | 0° |

Dans MEM1, les acteurs sont identifiés autour de `0x81238E58`, `0x8122A05C`,
`0x8123440C` et `0x81234DDC`. Relativement à ces positions : `+0x38` référence la
ressource et `+0x3C` le créateur. Les matrices des modèles ont leur translation à
`0x81239120`, `0x81229A60`, `0x81234B30` et `0x81235110` respectivement.
Les matrices des contrôleurs de pont conservent +44°/+46° : inverser toutes les rotations
de l'éditeur aurait donc été incorrect.

`scripted-previews.mjs` applique le quart de tour aux seuls ponts de `Bridge_Spawner.ai`.
Pour les contrôleurs ID 10 de `PushBlock_Template.ai`, le haut et le socle sont assemblés
à la position du contrôleur. La pose du premier canon est mesurée ; l'application du même
assemblage aux deux autres contrôleurs est une inférence du script commun, pas une
observation de ces secteurs. Les aperçus restent **LIKELY**, en lecture seule.
Leur surface sélectionne le contrôleur éditable ; déplacement et annuler/rétablir
conservent la rotation relative. L'échelle provient de la ressource clonée.

## Trésor et plateforme

`Legendary_Treasure_Ancient_Shell`, 4124024, se trouve dans la ressource
`Loot_Special_Ancient_Shell.lvl`, à (33.007, 4.911, −41.955). Le bit 0 du mot `+0x54`
est positionné, comme pour les modèles de pont et de canon. Aucune surface de terrain
n'est trouvée sous ce point : ajouter une plateforme artificielle y serait trompeur.

L'objet du niveau est `Legendary_Treasure_Ancient_Shell(1)`, 1823456,
à (−70.448, 5.004, 0.667), bit 0 non positionné, groupe `Loot`.
L'unité géométrique **737**, matériau `WoodPlank_01_MAT`, contient la plateforme :
l'intersection verticale avec ses triangles donne **Y = 4.968**, juste sous le trésor.
Elle figure déjà dans les unités de décor affichées ; aucun maillage n'a été inventé.
Le diagnostic reproductible est `.local/mesh-coverage-study/terrain-pose.mjs`.

L'interprétation du bit `+0x54` reste **LIKELY**, limitée au tutoriel, et non éditable.
Le calque **Modèles et objets désactivés** permet d'afficher ces 296 enregistrements
à leurs coordonnées de stockage. Ils sont masqués par défaut ; certains peuvent être
activés plus tard par le jeu. L'inspecteur propose un lien vers l'objet actif homonyme
lorsque son modèle et son comportement concordent, notamment pour le trésor.

## Vérifications

`editor-scene-poses.test.mjs` compare les aperçus aux poses relevées, vérifie que les
octets du niveau restent inchangés, et couvre les rotations relatives après actualisation.
Les captures WebGL locales se trouvent sous
`.local/mesh-coverage-study/browser-tutorial-bld/pose-*.png`.
