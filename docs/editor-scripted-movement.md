# Déplacements des objets scriptés : tonneaux et ressources

Le déplacement de `Barrel(6)` fonctionne dans le tutoriel avec son script et son modèle partagé conservés.
Deux lancements du même patch montrent le tonneau sur l'île de départ, devant le moulin.
Le contrôle qui déplace seulement la ressource nommée `Barrel` au même endroit ne produit pas ce résultat.
Ce dernier contrôle est un essai unique : il explique un cas de sélection sans effet visible, pas tous les tonneaux.

## Utilisation dans l'éditeur

L'inspecteur affiche **Déplacement en jeu** au-dessus des coordonnées :

- Pour une ressource ou un objet initialement désactivé, **Voir le placement** sélectionne un homologue du niveau.
  `Barrel` propose notamment `Barrel(6)` et les autres placements actifs homonymes.
- Pour une ressource créée par script, **Voir le créateur possible** sélectionne un objet dont une instruction
  de clonage emploie explicitement sa propre position. Les créations sont signalées comme conditionnelles.
  Les cas étudiés du pont, du quai et des canons sont filtrés selon leur assemblage initial :
  `Template_Bridge_whole` mène à `First_Bridge`, et non au quai qui partage pourtant son script.
- Pour `Drifting_Piece`, le déplacement continue de traduire les points privés de trajectoire avec l'ancre.
  Une trajectoire non reconnue ou partagée reste refusée.
- Pour les autres placements, l'inspecteur décrit une position initiale dont l'effet visuel reste à vérifier.

Les liens sélectionnent et cadrent l'objet ; ils ne modifient aucune donnée. Leurs coordonnées suivent la session.
Le modèle partagé et la position propre au placement sont expliqués séparément. La présence de `displace` ou
`slide` ne suffit plus à suggérer une réinitialisation : ces instructions peuvent déplacer des copies ou des débris.

## Contrôles dans Dolphin, 15 septembre 2026

Source : `level/Level_027_Tutorial.bld`, entrée 3, fichier décodé SHA256
`2976f3597df5f7aa8f3ba564b6f54c6170a08cabb204753d2bf3c70206a32e3f`.

| Variante | Modification | Observation |
| --- | --- | --- |
| `barrel-control-1789474472958` | `Barrel(6)`, offset 3074164 : xyz → `(88, 11.5, 40)` | Tonneau couché visible entre le moulin et le pont ; tutoriel jouable. |
| `barrel-control-1789475022808` | Exactement la même archive reconstruite | Même tonneau à la destination ; tutoriel jouable. |
| `barrel-resource-1789475419544` | `Barrel`, offset 3983352 : mêmes xyz ; `Barrel(6)` inchangé | Aucun tonneau à la destination dans les captures jouables. Comparaison unique réalisée après les essais positifs. |

Chaque variante change seulement trois mots f32be : `+0x24`, `+0x28`, `+0x2C`.
Le modèle `barrel.mdl` (2794492), partagé par 25 placements, et `Barrel.ai` (2739632) restent inchangés.
Archive positive SHA256 : `ee1b35459597567c976abfd52b488e6866a7f36fe41dfe97aba93b57c4b2a41b`.
Archive ressource SHA256 : `005f2086c9498c343d63c722d81cc9e51b36f6851be27515bb5bad9182141653`.

Les trois essais ont une ligne FileMon à **15 333 kB**, contre **15 241 kB** pour l'original. Ce contrôle prouve
la consommation du remplacement ; le résultat visuel est jugé séparément sur les captures de fin de macro.
Dans les deux essais positifs, le triplet apparaît notamment à `0x804F81E0`, `0x80CE4930` et `0x81235C90`,
en plus des copies du placement chargé à `0x810AA8B8` et `0x810AA8D0`.
Dans le contrôle ressource, il apparaît seulement à `0x8118883C` et `0x81188854`, dans le bloc de ressource chargé.
Ces recherches de triplets complètent les images ; elles ne constituent pas un inventaire exhaustif des acteurs.

Les trois Dolphin de recherche ont terminé la macro de 53 étapes avec Sonic Boom, puis se sont fermés normalement.
L'installation personnelle et le WBFS original ont été préservés. Captures, mémoire, archives et traces restent dans
`.local/script-remediation/<identifiant>/` et `.local/dolphin-evidence/`. Le résultat normalisé, validé contre le contrat
des expériences, est `.local/dolphin-evidence/experiments/barrel-placement-2026-09-15.json`.

## Conclusions et limites

**CONFIRMED** : la translation du placement `Barrel(6)` à cette destination fonctionne sans modifier de script,
de pointeur ou de valeur partagée. Le partage du modèle n'empêche donc pas cette translation.

**LIKELY** : le `Barrel` sans suffixe est une ressource ou un objet initialement inactif ; déplacer sa position
de stockage ne déplace pas les tonneaux visibles. Son bit initial `+0x54 & 1`, ses références et le contrôle unique
sont concordants. Les homologues proposés sont des candidats distincts, pas des copies forcément issues de cette ressource.

`Barrel.ai` contient des déplacements visant `Barrel_Spinner` et les particules de destruction.
`LootSystem_Init.ai` référence les ensembles de destructibles via ses macros de butin. Cela ne démontre pas
une remise à zéro générale des positions. Le graphe de macros n'est pas exécuté par l'éditeur.

Les autres scripts peuvent imposer une trajectoire, créer un acteur à partir d'une variable ou dépendre d'un emplacement.
Cette remédiation facilite le choix de l'ancre ; elle ne simule pas tous les scripts. Aucun nouveau champ de script,
drapeau d'activation, collision ou comportement n'est éditable. Le tonneau est couché en jeu mais son aperçu direct
utilise encore le cap seul : le tangage et le roulis ne sont pas pris en charge par ce rendu. M4/M5 restent inchangés.

## Reproduction et validation

Dans une session distincte ouverte sur la source originale, sélectionner `Barrel(6)` (3074164), entrer
`(88, 11.5, 40)`, puis utiliser **Patch** avec **Test du tutoriel, puis fermer Dolphin**. Relancer le même patch.
Comparer avec une autre session originale où seul `Barrel` (3983352) reçoit ces coordonnées.
Ne pas ajouter ces contrôles aux modifications de travail de l'utilisateur.

`editor-movement-diagnostics.test.mjs` vérifie les expressions bornées, les liens, la distinction pont/quai,
l'absence de changement du modèle partagé et Annuler/Rétablir octet par octet. Ces tests ont échoué avant
l'implémentation. Le contrôle WebGL avec un profil Edge distinct vérifie navigation, déplacement du bon tonneau,
Annuler/Rétablir, cadrage et poses des ponts/canons, sans erreur du navigateur.
Les suites locales passent : 237 tests SSA et 6 tests Dolphin MCP, sans échec ni test ignoré.

La session `s_d58eb87d` a été reconstruite depuis les plans de ses 30 états d'historique, avec égalité des octets
vérifiée à chaque état. Fichier sauvegardé conservé : SHA256
`33acc5d35eccc586161b6127ebe14f4979fb8029213f45ebce34263fd6fa06df` ; 20 mots modifiés au total.
Le patch existant de l'utilisateur et le checkpoint local sont conservés, séparément des essais de tonneaux.
