# Validation — 2026-09-16

## Résultat

Ajout réel confirmé et intégré : tutoriel SSPP52 Rev1, tournesol source 3446244 et Barrel source 3983352, deux instances supplémentaires maximum au total, position et orientation, échelle 100. Aucun objet sacrifié, aucune insertion IGZ. Project indique désormais les diagnostics et tests des autres familles ; leur déplacement existant et le remplacement avancé restent distincts. Les preuves du premier périmètre ci-dessous restent historiques ; l'extension est détaillée en fin de document.

## Preuves

| Vérification | Résultat |
|---|---|
| Recette native, deux cold boots | PASS : `gecko-1789513063448` et `gecko-1789513507766`, quatre tournesols visibles, originaux/weed conservés, instances et acteurs distincts |
| Parcours navigateur | PASS : `.local/object-workflow/browser-1789513997418`, vrais dépôts depuis miniature et nom, positions distinctes, aucune victime, 673 → 675 objets, rotation 240°, scale désactivé, Undo/Redo/Reset, sauvegarde associée, zéro exception |
| Clavier/accessibilité | PASS : aucun contrôle imbriqué dans summary ; Espace/Entrée sélectionnent/replient les dossiers |
| Patch issu du navigateur, boot1 | PASS : `editor-test-1789514119071-ab6b8e14` |
| Même patch, boot2 | PASS : `editor-test-1789514394220-10b9a4bf` |
| Consommation | Deux fois 15333 kB dans FileMon contre 15241 kB pour l'archive originale ; instances natives vérifiées dans MEM1 |
| Résultat visuel | Deux copies aux emplacements du navigateur : `[94.169,10.438,40.5]` /285° et `[88.492,9.936,52.151]` /240°. Les deux tournesols initiaux et la mauvaise herbe restent visibles dans les captures `52-tutorial-moved-left` des deux runs |
| Fin de run | Fermeture sans force, profil Dolphin restauré après chaque boot ; GDB absent du parcours final |
| Suite SSA |255/255 PASS |
| Suite Dolphin MCP |6/6 PASS |

Empreintes du patch final : archive `aa1fb06811f0ae1be011a6e073d1d8bfa6d64d8674e6fb19ad7e9369f58940c1`, Gecko `35fc09d81fe156e0003449ae6791ed08f36b0c9065d6268c533d39fb96550dea`. IGZ inchangé pour ces seuls ajouts : `2976f3597df5f7aa8f3ba564b6f54c6170a08cabb204753d2bf3c70206a32e3f`.

Rapports locaux : `.local/native-addition/editor-proof-1789514119070/` et `.local/dolphin-evidence/experiments/native-editor-two-boots-20260916.json`. La preuve regroupe lecture RAM et examen visuel ; le lanceur laisse volontairement son indicateur automatique `visual_effect` à UNJUDGED.

## Préservation et limites

Session utilisateur `s_d58eb87d` migrée en conservant l'identité, la date d'ouverture, les octets exacts et son état courant : 0 Undo, 2 Redo, aucun save/patch actif. Les deux états d'historique ont été reconstruits et comparés octet par octet avant redémarrage du serveur. Le précédent checkpoint de 44 opérations n'a pas été réappliqué.

L'essai GDB ralentissait fortement l'émulation : arrêté sans forcer et écarté. Les runs finaux utilisent Gecko sans trace active. Le premier appel Gecko précoce avait créé un acteur invisible ; cet échec reste documenté et n'est pas présenté comme réussite. La recette tardive attend l'initialisation de la source et fournit une expression native d'orientation.

Cette recette est propre au démarrage à froid. Recharger le niveau dans une même émulation ne réarme pas les copies. Scale, sources sans finding propre, nouvelles géométries, collisions et import inter-niveaux restent hors périmètre. M4A/M4B/M5 restent UNKNOWN. Une capture noire, un boot réussi ou une simple allocation ne suffisent jamais à élargir ce périmètre.

## Extension compatibilité et Barrel

- Deux boots identiques des lots `batch-1789515929960-66501f94` et `batch-1789516240184-d7e23442` : Barrel supplémentaire visible, acteur distinct avec source/modèle/transform attendus, script conservé. Les essais Chompy de ces mêmes lots restent indéterminés et ne sont pas inclus dans le PASS Barrel.
- Contrôle Barrel seul `batch-1789517137901-64e9eaf6` : PASS mémoire et visuel à `[90,10.5,48]`, relevés intermédiaires et finaux, fermeture sans force et profil restauré. Preuve formelle `native-barrel-two-boots-20260916` ; finding `level.prop.native-addition-barrel`.
- Deux essais Barrel seul à `[95.5,10.5,43]` : visible dans le dialogue puis absent en fin de macro. Le rapport conserve ce résultat ; aucune conclusion sur destruction/loot sans preuve dédiée.
- `1_Coper(1)` et `Enemy_ChompyNipper` : résultat de cycle de vie indéterminé, Add désactivé. Les scripts ne sont pas considérés incompatibles par défaut.
- Catalogue : 673 sources, 234 familles structurellement testables, 2 sources Add. Diagnostics par objet, filtres, Inspector, boutons Test selected/Test next 2 types/Stop test, galerie de toute la séquence. Tests techniques sans promotion automatique.
- Suite SSA : **267/267 PASS** ; Dolphin MCP : **6/6 PASS**. Test navigateur tournesol : `.local/object-workflow/browser-1789517296363`, zéro exception, filtre 2,3 ms, sauvegarde et réouverture des ajouts.
- Test navigateur Barrel : `.local/object-workflow/browser-1789517477440`, PASS, filtre 2,7 ms, zéro exception. Deux vrais dépôts depuis miniature/nom, rotation, Undo/Redo/Reset, sauvegarde/réouverture avec script exact2739632 et patch `.local/patches/edit-level-1789517575601`. Ce test d'interface ne lance pas Dolphin ; les preuves de création/rendu sont les boots séparés ci-dessus.
- Session ouverte `s_d58eb87d` conservée dans son état courant au redémarrage final : 0 Undo, 1 Redo, 673 objets, aucun save/patch actif. Identité, date et contenu du plan comparés au checkpoint ; l'ancien historique n'a pas été réappliqué.

Guide utilisateur et limites : [compatibility.md](compatibility.md). Les vérifications restent limitées à la création et au rendu des sources confirmées ; elles ne constituent pas une validation de gameplay M5.
