# Validation — 2026-09-16

## Résultat

Ajout réel confirmé et intégré : tutoriel SSPP52 Rev1, tournesol source3446244, Barrel3983352, Enemy_ChompyNipper2390540 et 1_Coper(1)3034548, deux instances supplémentaires maximum au total, position et orientation, échelle100. Aucun objet sacrifié, aucune insertion IGZ. Project indique les diagnostics et tests des autres familles ; leur déplacement existant et le remplacement avancé restent distincts. Les preuves des premiers périmètres ci-dessous restent historiques ; la correction de cycle de vie est détaillée en fin de document.

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
- À ce stade historique, `1_Coper(1)` et `Enemy_ChompyNipper` restaient indéterminés, Add désactivé. Cette limitation est levée pour les deux sources exactes par la correction décrite ci-dessous.
- Catalogue : 673 sources, 234 familles structurellement testables, 2 sources Add. Diagnostics par objet, filtres, Inspector, boutons Test selected/Test next 2 types/Stop test, galerie de toute la séquence. Tests techniques sans promotion automatique.
- Suite SSA : **267/267 PASS** ; Dolphin MCP : **6/6 PASS**. Test navigateur tournesol : `.local/object-workflow/browser-1789517296363`, zéro exception, filtre 2,3 ms, sauvegarde et réouverture des ajouts.
- Test navigateur Barrel : `.local/object-workflow/browser-1789517477440`, PASS, filtre 2,7 ms, zéro exception. Deux vrais dépôts depuis miniature/nom, rotation, Undo/Redo/Reset, sauvegarde/réouverture avec script exact2739632 et patch `.local/patches/edit-level-1789517575601`. Ce test d'interface ne lance pas Dolphin ; les preuves de création/rendu sont les boots séparés ci-dessus.
- Session ouverte `s_d58eb87d` conservée dans son état courant au redémarrage final : 0 Undo, 1 Redo, 673 objets, aucun save/patch actif. Identité, date et contenu du plan comparés au checkpoint ; l'ancien historique n'a pas été réappliqué.

Guide utilisateur et limites : [compatibility.md](compatibility.md). Les vérifications restent limitées à la création et au rendu des sources confirmées ; elles ne constituent pas une validation de gameplay M5.

## Correction Chompy et pièce — 2026-09-16

- Témoins : deux boots `batch-1789559355785-de449061`, instantané de création `lifecycle-1789560103836`, trace de désactivation `lifecycle-1789560836291`. Les copies sont créées actives, puis désactivées par le gestionnaire natif de distance ; le partage du script ou de l'ID ne suffit pas à expliquer cet échec.
- Correctif : factory inchangé, appelé depuis la mise à jour d'activation après disponibilité d'observateurs natifs et de l'ancre du tutoriel. Scripts, IDs, distances et originaux conservés ; paramètres d'acteur propres. Aucun débogueur GDB ni trace active dans la recette livrée.
- **Deux boots identiques PASS création/rendu** : `batch-1789561424640-943fbc8d`, Gecko SHA256 `e32d748e1df7952a3d2626153b4ea29756358a395d41ade537f8bb2ecccdc1ca`. Pièce visible et animée, Chompy visible en mouvement, instances/acteurs distincts et transform initial vérifié. Captures40 examinées pour les deux boots ; Hugo, pont, tournesols et décor conservés. Fermeture sans force et profil restauré deux fois.
- Preuves formelles locales : `native-chompy-activation-two-boots-20260916` et `native-coin-activation-two-boots-20260916`. Findings exacts `level.prop.native-addition-chompy` et `level.prop.native-addition-coin`, CONFIRMED/editable. La disparition ultérieure du Chompy reste séparée de sa création ; aucun PASS de combat/collecte n'est déduit.
- Suites : **271/271 SSA**, **6/6 Dolphin MCP**. Le contrôle rejette une position initiale erronée, un script remplacé, des paramètres d'acteur partagés et des variables locales partagées, tout en acceptant un transform courant modifié par l'IA.
- Catalogue : quatre sources Add ; rapports par famille versionnés `native-family-v2-observer-ready` pour ne pas réutiliser un échec de l'ancienne recette.
- Contrôle de deux Chompy identiques : `chompy-pair-1789562012150`, INI `c1f1116f620cf56b6df770914d7504472f5aa036c04c77103d2da0964022ff83`. Deux copies de source2390540 visibles ensemble aux captures31/34, même ID natif1 et même script2348068 ; acteurs2166556192/2166572024, paramètres2166527948/2166557564 et variables locales2166526288/2166557048 distincts. Transform initiaux conservés et déplacements courants indépendants. Suppression ultérieure séparée de la preuve de création, fermeture sans force et profil restauré.

- Parcours navigateur Chompy : `.local/object-workflow/browser-1789563131916`, PASS, filtre 3,5 ms, zéro exception. Pièce : `.local/object-workflow/browser-1789563338989`, PASS, filtre 4,2 ms, zéro exception. Deux vrais dépôts par parcours, rotation, Undo/Redo/Reset, sauvegarde/réouverture avec script exact et génération du patch. Ces patches aux destinations du navigateur ne sont pas les patches des preuves visuelles Dolphin ci-dessus.
- Serveur final actualisé avec les deux hooks du compilateur. Session `s_d58eb87d` préservée : 673 objets, 0 Undo / 2 Redo, aucun save/patch actif. Checkpoint frais, plans et historique reconstruits et comparés ; identité, date d'ouverture et état courant vérifiés après redémarrage.

- Régression finale mixte : `regression-1789563095579` et `regression-1789563650992`, deux boots identiques SHA256 `1ff0eddd3577344bef5bf900564e7852c6f1532cf1ba12e4076252f60cab45ac`. Barrel et tournesol supplémentaires visibles ensemble aux captures52, avec originaux conservés ; les neuf relevés du tutoriel et le contrôle final passent à chaque boot. Fermetures sans force, profils restaurés. Preuve locale `native-mixed-activation-two-boots-20260916`. Les anciens lots mixtes à une autre position/orientation du tournesol restent visuellement indéterminés et ne sont pas comptés comme succès.
