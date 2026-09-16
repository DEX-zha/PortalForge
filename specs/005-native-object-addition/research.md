# Recherche : création native

## Décision

Étudier le handler natif de l'instruction de script `clone||at|facing||cloned`. Observer ses appels réels avant de tenter de créer un objet. La représentation persistante du patch reste à déterminer ; aucune route Add activée avant preuve.

## Résultats et alternatives

- **CONFIRMED (périmètre existant)** : copie visible par remplacement de même taille ; insuffisant pour l'ajout demandé. Voir docs/igz-level-editing.md et docs/m3-status.json.
- **LIKELY (modèle du chargeur)** : les parcours bornés par nombre de records et les parcours de blobs expliquent les blocages des insertions. Les append précédents peuvent rester bruts, sans construction. Findings `igz.loader.head-span-count-walk`, `igz.loader.blob-walk-stomps-insertions`.
- **LIKELY (audit historique)** : les listes supposées libres ne constituent pas une réserve validée ; 609 listes dérivées des pointeurs runtime n'avaient pas de capacité libre. Finding `igz.detection.heuristic-limits`.
- **LIKELY (inventaire local)** : 85 scripts associés à des placements contiennent 592 références d'instructions clone dans leurs listes. Des instructions peuvent être partagées : ce ne sont ni 592 appels exécutés ni 592 instances nouvelles. `.local/object-workflow/addition-audit.json`, source SHA256 `2976f3597df5f7aa8f3ba564b6f54c6170a08cabb204753d2bf3c70206a32e3f`, fichier inchangé. Ressources de ponts/canons et Barrel retrouvées.
- **UNKNOWN** : contexte nécessaire pour invoquer la création sur commande, ownership du résultat, identité/nom, conservation des ressources et application après chaque démarrage.

Les copies réservées à l'éditeur ont été explicitement écartées par l'utilisateur. Un remplacement automatique d'un objet lointain ne satisfait pas non plus l'exigence.

## Instrumentation

### Handler natif identifié par lecture seule (T004)

Le record `clone||at|facing||cloned` à l'offset fichier `0x1b1f5c` correspond, dans le relevé historique scene-pose, à `0x80f6df7c`. Sa vtable `0x80486514`, slot `+0x78`, mène à `0x800444f4`. L'appel à `0x800445c4` entre dans `0x80041984` ; reprise à `0x800445c8`. Arguments probables : r3 source résolue, r4 pointeur XYZ, r5 **objet expression d'orientation**, pas un flottant. Retour r3 instance/null. `0x80044164` est un dispatcher, pas une API de création.

La plage `[0x80041984,0x80041b74)` est identique dans trois dumps indépendants (SHA256 `8fcf8ff29324baff5246ef8dbf3dcab41c983941b8ac603b7554fff8bd2b42a3`). Elle alloue, copie via les métadonnées de classe, écrit XYZ et source/activator, puis active la nouvelle instance. Les champs d'exécution et la liste de clones ne sont pas recopiés par la politique de copie observée ; une méthode spécifique reconstruit collision/paramètres d'acteur. Ce décodage reste **LIKELY**, non éditable ; aucune propriété de collision n'est validée par cette lecture.

Le tournesol sans script partage la classe du pont dans le dump. Inconnues : effet de l'ID conservé, contexte global, durée de vie et export persistant. Aucun espace mémoire supposé libre n'est autorisé comme code cave. Rapports locaux : `.local/object-workflow/native-clone-research.json`, `native-clone-protocol.md`. L'étape suivante observe les appels natifs sans altérer leurs arguments.

Felk scripting-preview4 expose les événements de breakpoint et la lecture/écriture de registres généraux/flottants, mais le pont MCP actuel n'expose pas ces opérations. Vérifier la configuration effective avant toute instrumentation. Sources primaires : [event.pyi](https://github.com/Felk/dolphin/blob/scripting-preview4/python-stubs/dolphin/event.pyi), [registers.pyi](https://github.com/Felk/dolphin/blob/scripting-preview4/python-stubs/dolphin/registers.pyi). Une API documentée ne prouve pas une connexion ou un callback opérationnel.

### Observation native témoin (T005)

Essai `.local/native-addition/observe-1789510647445` : 2 580 lignes d'entrée/retour, sans modification de l'archive ni des arguments. Le pont source `0x80f6dfc8` est transmis avec XYZ à `0x80f85dd0` et expression d'orientation `0x80f43bc8`. Retour `0x81229d70` à `0x800445c8`. Le relevé MEM1 retrouve cette instance active, parent/source `0x80f6dfc8`, activator `0x80f85d94` et position `[-6.096,5.473598,-19.964399]`. L'empreinte du code correspond à T004. Tutoriel atteint, captures conservées, fermeture sans terminaison forcée et configuration restaurée.

Cela valide le ciblage de l'appel **existant**, pas la capacité d'ajout de l'éditeur. L'essai supplémentaire reste distinct.

### Appel exploratoire et persistance étudiée

Le débogueur GDB de Felk fonctionne sous Windows et permet PC/LR/GPR/FPR-PS0. La commande groupée `G` présente un décalage de lecture dans cette version ; la sonde utilise `P` individuellement et compare le contexte restauré. PS1 n'est pas exposé ; l'expérience intervient à la frontière d'appel native, où les registres volatils ne sont pas conservés par l'ABI. Source : [GDBStub.cpp](https://github.com/Felk/dolphin/blob/scripting-preview4/Source/Core/Core/PowerPC/GDBStub.cpp), [CPU.cpp](https://github.com/Felk/dolphin/blob/scripting-preview4/Source/Core/Core/HW/CPU.cpp).

Gecko C2 constitue une piste de patch **Dolphin**, sans insertion IGZ : son handler réserve explicitement `[0x80001800,0x80003000)`, avec 3 256 octets disponibles pour les codes dans le runtime local vérifié. Cela ne signifie pas que ces adresses sont libres hors du handler. La sonde locale vise le retour après l'appel original, conserve son résultat et limite l'appel supplémentaire à un seul essai par boot. Activation, résultat, reprise et export restent à prouver. Source : [GeckoCode.h](https://github.com/Felk/dolphin/blob/scripting-preview4/Source/Core/Core/GeckoCode.h), [GeckoCode.cpp](https://github.com/Felk/dolphin/blob/scripting-preview4/Source/Core/Core/GeckoCode.cpp), [codehandler.s](https://github.com/Felk/dolphin/blob/scripting-preview4/docs/codehandler.s).

### Premiers résultats exploratoires : échec visuel conservé

- GDB : deux exécutions interrompues proprement, avant tout appel supplémentaire. La première a été arrêtée après identification du défaut de `G` ; la seconde ralentissait fortement la macro (signalé aussi par l'utilisateur) et restait dans les menus. GDB écarté des essais de rendu suivants. Les réglages temporaires ont été restaurés.
- Gecko précoce, `.local/native-addition/gecko-1789511665997` : branchement consommé en mémoire, garde passée de 0 à 2, pointeur neuf `0x8122a164`, source `0x81105604`, position `[91.349,10.435,43.275]`, acteur `0x8122f35c`. L'original du pont `0x81229d70` reste distinct. La source possède désormais une liste de clones. Le tutoriel est jouable à cadence normale, fermeture sans terminaison forcée.
- **Échec du critère visuel** : la nouvelle plante n'apparaît pas à la destination où un ancien remplacement était visible. Le modèle est lié et la matrice d'acteur porte la bonne position ; cela ne prouve donc pas le rendu. Différences observées : heading 0 au lieu de 285, activationRange 0 au lieu de 180, création avant l'activation de la source et activator hérité du pont. Aucun de ces écarts n'est encore établi comme cause.
- Variante suivante : attendre une source active avec acteur créé et fournir une expression native d'orientation dans les données réservées du handler. Un résultat mémoire positif reste insuffisant pour activer Add dans l'éditeur.

### Recette additive confirmée (T006)

Les essais tardifs `gecko-1789512135253` et `gecko-1789512594054` montrent une copie visible en plus des deux tournesols initiaux. La recette généralisée à deux entrées est ensuite identique dans `gecko-1789513063448` et `gecko-1789513507766` : INI SHA256 `98b4c2f8913f272b4de87fba1bb9e38d9a8892f5d3504169aaa0061b95c604ec`. Quatre tournesols visibles, mauvaise herbe conservée, deux nouvelles instances/acteurs distincts et quatre acteurs dans le graphe du modèle. Positions `[91.349,10.435,43.275]` et `[89.049,10.435,43.275]`, orientations 285° et 240°. Deux démarrages à froid, macro et déplacement normaux, fermeture sans force, configuration restaurée.

Preuve formelle locale : `.local/dolphin-evidence/experiments/native-addition-two-boots-20260916.json`. Finding `level.prop.native-addition` CONFIRMED, éditable dans ce périmètre seulement. Le champ `originalPointer` de la sonde ne suffit pas à prouver la conservation : l'objet natif peut être temporaire ; la preuve utilise les tournesols initiaux, leurs acteurs et le pont témoin.

Recette : C2 au retour `0x800445c8`, garde de réentrance, attente de la source active avec acteur, appel `0x80041984`, expression native privée pour heading via `0x8005c4d0`, reprise de l'instruction `mr r29,r3`. Aucune insertion IGZ. Le compilateur préserve registres généraux, contrôles et PS0 volatils à cette frontière ABI ; il ne revendique pas une sauvegarde de PS1. Identité d'ajout int32 négative, données PFNA, état et pointeur résultat vérifiés séparément. Empreinte complète du factory contrôlée au démarrage.

Limites : SSPP52 Rev1, tutoriel et source fichier `3446244` (`plant_sunflower_whole.mdl`), deux ajouts maximum, échelle 100%. Déplacement et orientation validés. Un nouveau démarrage de l'émulation est nécessaire après changement de patch ou rechargement du niveau ; la garde persiste pendant une émulation. Les autres sources, scripts, imports et changements de collision restent indisponibles. La cause précise de l'échec précoce n'est pas isolée : initialisation et orientation ont changé ensemble.

### Extension familles et Barrel (T014–T018)

La garde « source active avec acteur » des fleurs excluait les templates scriptés, souvent inactifs sans acteur. La sonde étendue attend le tournesol témoin `0x81105604`, puis vérifie la classe, le modèle, le parent nul et le script exact de la source candidate. Le factory conserve ce script. Les recettes sont indexées par source/modèle/script et finding ; aucun nom approchant ne suffit.

- `1_Coper(1)` source3034548, modèle3036352 `Treasure_Coin_A.mdl`, script3034796 `Placed_Loot_Spinning.ai` : retour factory non nul, mais aucun acteur correspondant vivant lors du relevé final du lot `batch-1789515615448-b064d7e3`. Cause UNKNOWN ; ne pas affirmer une collecte réussie.
- `Enemy_ChompyNipper` source2390540, modèle1214412, script2348068 : même incertitude de durée de vie dans `batch-1789515929960-66501f94` et `batch-1789516240184-d7e23442`. Aucun combat validé.
- `Barrel` source3983352, modèle2794492, script2739632 : acteur distinct, position initiale `[90,10.5,48]`, heading0 et rendu visible dans les deux derniers lots identiques (INI `46a58bd5acceef25c08a9a6f7ec49d3becf38b2b18fecae508ee04b3de9f3e9a`). Le lot isolé `batch-1789517137901-64e9eaf6` confirme ce résultat sans autre source demandée. Finding `level.prop.native-addition-barrel` CONFIRMED ; expérience formelle `native-barrel-two-boots-20260916`.
- Contrôle du cycle de vie : deux boots identiques de `batch-1789516571830-61dbcec2`, Barrel seul à `[95.5,10.5,43]`, montrent le Barrel pendant le dialogue (`34-tutorial-hugo-3`), puis sa disparition avant la dernière capture. Création visible prouvée ; cause de disparition UNKNOWN. Une inspection finale seule donnait donc un diagnostic incomplet.

La campagne relève désormais la mémoire à chaque capture du tutoriel et conserve toute la séquence. Le lanceur distingue une création scriptée vérifiée puis un état final changé ; il ne relâche pas la vérification finale des décorations statiques. Les rapports ne valident automatiquement ni le rendu ni le gameplay. Les tests ne touchent pas la scène ouverte. M4A/M4B/M5 restent UNKNOWN.

### Investigation prioritaire ennemis/loot (T019–T022, périmètre confirmé)

L'audit des sources originales trouve 8 placements partageant `Enemy_Chompy.ai` (IDs0/1), 41 placements partageant `Placed_Loot_Spinning.ai` (ID1) et 25 partageant `Barrel.ai` (ID0). Chacun possède un bloc `_actorParameters` distinct. La seule répétition du script ou du champ ID n'établit donc pas un conflit de copie. Les métadonnées natives indiquent que `_execBehavior` (+ac) et `_localVarList` (+b0) sont des états d'exécution non recopiés, alors que `_script` (+a8) et `_ID` (+20) sont copiés ; la copie native reconstruit les paramètres d'acteur. Cela reste une lecture du mécanisme, pas une preuve de bon fonctionnement pour les ennemis.

Témoin `batch-1789559355785-de449061` : Chompy à `[90,10.5,48]`, pièce à `[88,10.5,43]`, scripts inchangés. Les deux boots identiques montrent les allocations libérées/réutilisées à la première capture du tutoriel, avant les dernières entrées de combat de la macro. La position précédente près du joueur n'explique pas à elle seule l'échec.

Sonde `lifecycle-1789560103836` : un instantané borné de 0xf8 octets pris immédiatement au retour du factory retrouve **les deux copies actives (état1), avec acteurs distincts et XYZ demandés**, paramètres d'acteur propres et script conservé. Le Chompy dispose d'une liste locale de variables ; la pièce n'en a pas à cet instant. Le contexte global d'activité vaut0. Les objets sont déjà détruits/réutilisés au relevé `intro-cinematic`. Ce résultat écarte un simple échec d'allocation ou l'absence initiale d'acteur, mais ne valide ni le rendu ni le comportement. Données et code exploratoire restent dans `.local/native-addition/`.

La trace `lifecycle-1789560836291` relève pour les deux copies une demande **état2**, LR `0x80062b88`, contexte VM nul : le gestionnaire de distance d'activation appelle `0x80042018` à `0x80062b84`. La désactivation retire un clone de la liste de son parent et conduit à l'état4/libération. La première sonde ne surveillait que les demandes3/4 et n'avait donc rien relevé ; son absence de trace n'était pas une absence de désactivation. Les distances d'activation originales sont150+20 pour le Chompy,140+0 pour la pièce,0+0 pour le Barrel. Finding diagnostique `level.prop.native-addition-activation-lifecycle`, non éditable.

Variante `lifecycle-1789561087535` : appel factory déplacé au retour du gestionnaire d'activation `0x80062b88`, après disponibilité d'une liste native d'observateurs non vide (`r30`, sauvegardé à `sp+0x80`) et de l'ancre du tutoriel. Les copies sont absentes de la première capture d'introduction, puis actives avec acteurs/paramètres propres ; pièce animée et Chompy visible en déplacement dans les captures suivantes. Les sources, IDs, scripts et distances restent inchangés. La suppression ultérieure du Chompy utilise cette fois une instruction de comportement (demande3, LR `0x80041d40`) ; ce n'est pas le défaut de création précoce. Sa cause de gameplay précise n'est pas extrapolée.

Le contrôle de transform lit désormais `_initMatrix` à +24/+34 pour la position/rotation demandée et rapporte séparément `_currentMatrix` à +3c/+4c : l'IA et la rotation d'une pièce peuvent modifier la seconde. Une divergence de la position initiale, un script remplacé ou des paramètres d'acteur partagés restent des échecs. L'empreinte de la partie non instrumentée du gestionnaire `[0x80062860,0x80062b88)` est `77ce73ad478b451bf6bf01c67104fbc439e5dc5a09818351bcf36babc9cd0b18`.

Contrôle mixte `regression-1789562330193` puis `regression-1789562705974` : Barrel visible, deux acteurs vérifiés en mémoire, mais la copie du tournesol à `[88,10.5,43]`/0° n'est pas discernable sur la capture finale. Ce lot ne constitue pas un PASS visuel des deux objets. Contexte, orientation et visibilité à cette destination n'ont pas été isolés comme cause. Par prudence, le compilateur compose désormais le hook statique déjà validé et le hook différé des scripts, au lieu d'imposer ce dernier aux deux objets. Les mots PPC de chaque partie sont identiques à sa compilation isolée ; limite globale de deux copies, IDs distincts et capacité Gecko commune sont vérifiés. Le contrôle suivant reprend pour le tournesol le transform `[94.169,10.438,40.5]`/285° du précédent parcours navigateur validé.

Contrôle final : les deux boots du lot mixte corrigé montrent simultanément les copies Barrel et tournesol, avec acteurs distincts et originaux conservés. Résultats et empreinte dans validation.md.
