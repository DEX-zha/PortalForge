# Étude du sol et des plateformes absents de l’éditeur

Étude du 14 septembre 2026, à partir de `editor=chat=session.txt`, du code actuel et des archives locales.
Finding : `igz.geometry.editor-coverage` (**LIKELY**, non éditable).

## Correction appliquée

L’éditeur affiche désormais les 1 584 morceaux de décor du tutoriel et les 641 de Mining via une voie
distincte, en coordonnées monde, sous le calque **Décor · lecture seule**. Les morceaux déjà associés
aux modèles sont exclus de cette voie ; les ressources séparées non résolues restent exclues du rendu.
Les paragraphes d’analyse ci-dessous décrivent l’état **avant** cette correction.

L’API expose `scenery` et `unresolved` en plus de `models`. Les blocs sont regroupés en lots pour limiter
les appels de rendu, en conservant leurs identifiants de descripteur. Le décor n’entre jamais dans la liste
des placements sélectionnables et ne reçoit aucune transformation d’objet. Les compteurs distinguent
explicitement les blocs décodés, associés aux modèles, affichés comme décor et encore non résolus.

Le premier test WebGL a révélé un écran gris : des surfaces de fond devenues opaques masquaient le niveau.
Les surfaces dont l’étendue dépasse la moitié de celle des placements (minimum 32 unités) sont désormais
affichées par défaut en filaire. Le réglage **Grandes surfaces pleines** permet de rétablir leur rendu solide.
Ce traitement concerne aussi les grands modèles placés et ne constitue pas une identification sémantique
du ciel ou des matériaux. Le cadrage reste centré sur la zone des placements, sans laisser ces fonds
déterminer le zoom. L’aperçu CLI inclut également le décor lorsque `--meshes` est demandé.

Les tests navigateur utilisent une instance Edge sans fenêtre, avec profil isolé sous `.local/` :
affichage réel du tutoriel et de Mining, calque Décor, All/None, filaire, sélection d’un modèle réel,
déplacement de son instance sans changement des sommets du décor et reconstruction de la scène sans doublon.
Les captures et résultats sont dans `.local/mesh-coverage-study/browser-tutorial-bld/` et `browser-mining-bld/`.
Aucune archive originale n’est modifiée et aucune capacité d’édition de géométrie/collision n’est ajoutée.

Validation du correctif : **219 tests passent**, sans échec ni test ignoré. Le nouvel audit des 76 archives
parcourt toujours 126 920 descripteurs ; il sert **92 705 blocs supplémentaires** comme décor et conserve
1 942 blocs non résolus (dont 1 478 entrelacés avec une fraction différente de 6). Leur espace de coordonnées
demande une validation avant de les inclure. Le rapport complet est `.local/mesh-coverage-study/corpus-after.jsonl`.

## Résultat

La cause principale est une omission entre le décodage et l’affichage. Le décodeur lit déjà les morceaux
du décor statique, mais l’éditeur transmet et dessine uniquement les maillages associés aux objets placés.
Une grande partie du sol, des bâtiments et des plateformes intégrées au décor n’emprunte pas cette voie.

Le « 210 modèles sur 210 » de la session décrit la couverture des modèles référencés par les placements.
Il ne mesure ni la couverture de toute la géométrie du niveau, ni la fidélité de chaque modèle.

## Mesures reproduites

| Mesure | Tutoriel | Mining | 76 archives locales |
|---|---:|---:|---:|
| Blocs géométriques décodés / descripteurs | 2 264 / 2 264 | 925 / 925 | 126 920 / 126 920 |
| Blocs distincts associés aux modèles placés | 677 | 279 | 32 273 |
| Blocs décodés absents de la géométrie envoyée à la vue | 1 587 | 646 | 94 647 |
| Dont blocs à attributs entrelacés, candidats au décor | 1 584 | 641 | 94 183 |
| Dont blocs à tableaux séparés, à examiner séparément | 3 | 5 | 464 |
| Modèles placés ayant au moins un maillage | 210 / 210 | 134 / 134 | 11 199 / 11 269 |

Environ 70 % des blocs du tutoriel et 75 % des blocs de cet échantillon de 76 archives sont donc omis.
Ces pourcentages portent sur les blocs sources, pas sur la surface visible à l’écran ou les instances rendues.
Le relevé historique de la session portait sur 112 fichiers : ce nouvel audit ne prétend pas reproduire ce périmètre.

Sur le tutoriel, les unités omises contiennent 252 075 sommets et 314 994 triangles.
Sur Mining, elles contiennent 245 650 sommets et 207 334 triangles.
La carte de pointeurs déjà capturée dans Dolphin (`ptr-scan3-fixups.json`) donne les mêmes comptes sur le
tutoriel que l’analyse structurelle. Le manque d’une carte runtime n’explique donc pas cette omission.

Attention au compteur `owned` : il additionne les associations entre modèles et blocs. Un bloc partagé peut
y apparaître plusieurs fois. Sur le tutoriel : 778 associations, mais seulement 677 blocs distincts.

## Où les données disparaissent

1. `src/igz/gxmesh.mjs`, `decodeGeometry` : produit tous les blocs décodés, y compris le décor.
2. `assignUnits` : cherche un modèle placé pour chaque bloc, avec un filtre de boîte englobante.
   Sans association retenue, il incrémente `world` puis quitte le traitement du bloc.
3. `src/editor/meshes.mjs`, `modelMeshes` : ne concatène que les blocs de `byModel`.
4. `meshesPayload` : renvoie `{ stats, models }`. Le nombre `stats.world` est conservé, mais aucune géométrie
   correspondante n’est sérialisée.
5. `src/view/scene.mjs`, `build` : crée des instances à partir des placements et de leur modèle.
   Il n’existe pas de branche de rendu pour le décor sans placement.

Les chemins `src/...` ci-dessus sont relatifs à `tools/ssa-archive/`.
Changer la caméra ou activer les calques ne peut pas afficher des sommets absents de la réponse API.
De même, `stats.complete = true` indique que le parcours du décodeur ne s’est pas interrompu ; ce n’est pas
un indicateur de complétude de la scène affichée.

## Vérification visuelle locale

Deux aperçus filaires ont été produits avec les mêmes données et la même caméra, près du début du tutoriel :

- [.local/mesh-coverage-study/placed-only.png](../.local/mesh-coverage-study/placed-only.png) : voie actuelle, objets placés seulement.
- [.local/mesh-coverage-study/with-world-candidates.png](../.local/mesh-coverage-study/with-world-candidates.png) : ajout des 1 584 blocs entrelacés non associés, sans transformation de placement.

Le second aperçu fait réapparaître le terrain de l’île et le bâtiment du moulin sous les pales déjà présentes.
Cela appuie l’interprétation de ces blocs comme décor déjà exprimé en coordonnées monde.
Cet aperçu expérimental est calculé hors navigateur, sans gestion des matériaux ni occultation correcte des
surfaces. Il ne constitue pas une nouvelle validation en jeu et ne modifie pas l’éditeur.

## Pourquoi « afficher tout ce qui reste » serait incorrect

- `world` signifie en réalité « sans modèle placé retenu ». Les trois blocs séparés du tutoriel (#1593–1595)
  portent des références aux textures de la Wiimote d’interface. Ils ne doivent pas devenir du terrain à l’origine.
- Mining laisse aussi de côté deux blocs séparés (#650–651) liés à des ressources de traitement du minerai.
  Leur rattachement et leur transformation demandent une étude complémentaire ; la détection des placements
  ne couvre pas nécessairement toutes les ressources animées ou créées par script.
- Deux blocs entrelacés du tutoriel (#360 et #583) sont déjà associés à `water_transition_dome.mdl`.
  Ajouter indistinctement tous les blocs entrelacés les dessinerait une seconde fois. Cette attribution reste
  celle de l’heuristique actuelle, sans nouvelle preuve de sa justesse dans cette étude.
- `boundsIn` cherche un attribut sur 0x400 octets sans s’arrêter au prochain en-tête. Les boîtes ainsi trouvées
  peuvent appartenir à un record voisin : elles ne suffisent pas à prouver seules la propriété d’un morceau.
- Le maillage visible et la collision sont deux données distinctes. Voir une plateforme ne prouve pas que
  le personnage puisse marcher dessus, et déplacer le visuel ne déplace pas automatiquement sa collision.

## Suite technique recommandée

Ajouter une voie de rendu du décor en lecture seule, avec des identifiants de descripteur et des compteurs
distincts : blocs décodés, blocs associés, candidats au décor rendus, blocs non résolus et arrêt éventuel.
Les candidats entrelacés non associés constituent un premier ensemble expérimental ; leur format seul ne
prouve pas les règles de visibilité ou d’activation du moteur.

Ces morceaux doivent recevoir uniquement la conversion commune d’axes lorsque leurs coordonnées monde sont
établies, sans appliquer une seconde translation, rotation ou échelle d’objet placé. Un calque « Décor » doit
permettre de les masquer. Le cadrage, les grandes surfaces de fond et la sélection des objets doivent être
vérifiés avec ce nouveau contenu. La voie des placements conserve ses transformations et son édition actuelle.

Traiter ensuite les ressources restantes par leur graphe de scène, leurs scripts ou leur squelette, et non
en les plaçant arbitrairement à l’origine. Vérifier au minimum le tutoriel et Mining, l’absence de doublons,
la séparation interface/décor et le maintien des opérations de sélection et déplacement.
L’édition de géométrie et de collision reste soumise aux gates M4A/M4B ; cette étude ne les change pas.

## Reproduction et portée

Depuis la racine du projet :

```powershell
node tools/ssa-archive/research-probes/probe-mesh-coverage.mjs .local/workspaces/tutorial-bld/entries/3-level.bld.decoded .local/workspaces/mining-bld/entries/3-level.bld.decoded
node tools/ssa-archive/research-probes/probe-mesh-coverage.mjs .local/workspaces/tutorial-bld/entries/3-level.bld.decoded --fixups .local/dolphin-evidence/ptr-scan3-fixups.json
```

Le script émet une ligne JSON par fichier, avec empreinte SHA-256, comptes, arrêts de parcours et exemples
de blocs omis. Depuis l’intégration, il distingue `unassigned` (sans modèle placé), `scenery` (servi comme
décor) et `omitted` (encore absent du rendu) ; les JSON antérieurs restent les preuves de l’état initial.
Les comptes sont comparés au résultat de la fonction API actuelle. Les fichiers de jeu sont
uniquement lus. Les rapports, le script d’aperçu et les images restent dans `.local/mesh-coverage-study/`.

Le statut Dolphin consulté conserve M0 PASS, mais aucun pont n’était actif (`ECONNREFUSED`, aucun PID possédé).
Aucune nouvelle expérience en jeu n’a été menée. Les conclusions de format restent LIKELY et non éditables ;
l’omission API est directement observable dans le code et reproduite par les mesures locales.

Vérifications finales : `npm test` dans `tools/ssa-archive` passe 212 tests, sans échec ni test ignoré ;
`findings validate` valide les 60 fiches ; `git diff --check` ne signale aucune erreur.
