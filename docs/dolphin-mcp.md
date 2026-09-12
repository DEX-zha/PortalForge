# M0 — Dolphin MCP : étape préliminaire obligatoire

Mis en place le 12 septembre 2026. **État : PASS — installé, testé avec SSA dans une scène jouable, remplacement Riivolution prouvé au niveau du moteur.** Le statut lisible par machine est dans `docs/m0-status.json` ; `dolphin_status` le renvoie.

Cette étape fait partie de la création de PortalForge. La planification détaillée et le développement des outils SSA peuvent maintenant commencer. M0 ne valide pas M1, M2 ni la faisabilité d'un éditeur.

## Installation effective

| Élément | Installation |
| --- | --- |
| Dolphin existant | `C:/Users/romai/Desktop/dolphin-2606a-x64/Dolphin-x64/Dolphin.exe`, conservé et jamais piloté |
| Runtime du MCP | `.local/dolphin-felk/Dolphin.exe`, Felk `scripting-preview4` |
| Serveur | `tools/dolphin-mcp/server.mjs`, Node.js, MCP stdio, 35 outils |
| Dépendances | `mcp-dolphin` 0.3.0, SDK MCP 1.29.0, Ajv 8.20.0, verrouillées dans `package-lock.json` |
| Pont local | `tools/dolphin-mcp/bridge.py`, chargé automatiquement avec `--script` |
| Commandes natives | scripts PowerShell UI Automation dans `tools/dolphin-mcp/`, ciblés sur le PID possédé |
| Réseau interne | `127.0.0.1:55355`, uniquement local |
| Profil de recherche | `.local/dolphin-user/` |
| Preuves | `.local/dolphin-evidence/` |
| Connexion Codex | serveur global `dolphin`, commande Node avec chemin absolu du serveur local |
| Jeu testé | WBFS SSA Europe Rev 1 fourni sur le Bureau ; identifiant mémoire `SSPP52`, révision 1 |
| Figurine testée | `Sonic Boom.sky` (1024 octets) ; l'original n'est jamais exposé au jeu, seule une copie est chargée |

Le chemin du WBFS est enregistré dans `.local/dolphin-config.json`. `dolphin_launch` utilise ce fichier si aucun jeu n'est précisé. Pour le déplacer, adapter ce fichier à partir de `tools/dolphin-mcp/config.example.json`.

L'archive téléchargée depuis les releases Felk est `dolphin-scripting-preview4-x64.7z`. SHA-256 enregistré : `FC6B298852B54AAED71C7E925919ACED0B56CECA7289BFCC07C06B4F47970DA0`. Il s'agit de l'empreinte de l'artefact testé, pas d'une signature de l'éditeur.

## Utilisation dans Codex

Recharger la session Codex pour que le serveur nouvellement enregistré soit découvert. La configuration a été vérifiée avec `codex mcp get dolphin --json`. Les essais de ce travail utilisent un véritable client MCP séparé, pas une simulation du protocole.

1. Appeler `dolphin_status` pour connaître les runtimes, la connexion et le statut M0.
2. Appeler `dolphin_launch` pour démarrer SSA dans le profil isolé (WBFS ou descripteur JSON Riivolution).
3. Appeler `dolphin_ping` une fois le jeu démarré.
4. Charger une figurine avec `dolphin_load_figure`, puis utiliser les observations, les contrôles et les sauvegardes ci-dessous.
5. Appeler `dolphin_stop` pour fermer uniquement l'instance possédée par cette session MCP.

Le processus MCP reste disponible lorsque Dolphin est arrêté. Un `ping` indisponible dans cet état est attendu. Ne pas lancer une seconde instance sur le port du pont. Après un redémarrage du serveur, une ancienne instance Dolphin encore ouverte doit être fermée avant un nouveau lancement : la propriété des processus n'est pas récupérée automatiquement. Le Dolphin 2606a de l'utilisateur, s'il est ouvert, n'est jamais touché.

## Capacités et limites

| Fonction | Outils / comportement |
| --- | --- |
| Lancement et arrêt | `dolphin_launch`, `dolphin_stop` ; fermeture Windows demandée avant terminaison de secours, résultat `forced` explicite |
| Connexion et statut | `dolphin_ping`, `dolphin_get_info`, `dolphin_status` (inclut `M0` depuis `docs/m0-status.json`) |
| Lecture mémoire | `dolphin_read8/16/32/64`, `dolphin_read_range`, `dolphin_read_float` |
| Écriture mémoire | `dolphin_write8/16/32/64`, `dolphin_write_float` ; MEM1/MEM2 seulement, valeurs 64 bits transmises exactement sous forme décimale textuelle |
| Contrôles Wii | boutons, pointeur IR, accélération en m/s², vitesse angulaire en rad/s |
| Nunchuk | `dolphin_hold_wii_input`, `dolphin_get_wii_input` ; boutons C/Z, sticks entre -1 et 1 |
| Actions maintenues | `dolphin_hold_wii_input`, 1 à 600 frames ; renouvellement des valeurs à chaque frame, relâchement observé en jeu |
| Wiimote | `dolphin_connect_wiimote` reconnecte une Wiimote émulée via l'interface native sans déconnecter une Wiimote déjà active |
| GameCube | boutons, sticks -1..1, gâchettes 0..1 ; non validés sur un jeu GameCube |
| Attente | `dolphin_frame_advance` attend **au moins** N frames, borne de 15 s ; pendant les chargements (moins de 60 fps) attendre par tranches de 120 frames |
| Pause / reprise | `dolphin_pause`, `dolphin_resume` via l'interface native, vérifiés par l'état de la barre d'outils ; le pont ne répond pas pendant la pause |
| Portal | `dolphin_load_figure` copie la figurine dans `.local/figures/` puis la charge dans le slot 1..16 ; `dolphin_remove_figure` vide un slot sans supprimer le fichier |
| Captures | `dolphin_screenshot`, image PNG retournée au client et conservée dans les preuves |
| Logs | `dolphin_logs`, lecture bornée ; appels et erreurs dans `calls.jsonl` |
| Sauvegarde | `dolphin_save_state`, slots natifs 1..10 via l'interface Dolphin ; vérifie l'écriture d'un nouveau fichier `SSPP52.sNN`, l'ancien est copié dans les preuves |
| Restauration | `dolphin_load_state`, slots 1..10 ; vérifie le fichier puis programme la lecture ; la reprise du jeu est à observer (capture) |
| Riivolution | `dolphin_build_patch_launch` prépare un descripteur JSON depuis un XML existant ; utiliser son chemin avec `dolphin_launch` |
| Reset | `dolphin_reset`, exposé mais pas encore testé dans une scène jouable |

Les sauvegardes par le pont Python (`savestate.save_to_slot`) échouent en pleine partie ; c'est pourquoi les outils d'état passent par l'interface native, limitée aux dix slots de Dolphin. Les outils natifs (pause, états, Portal, Wiimote) exigent un bureau Windows interactif et une interface Dolphin en français ou en anglais.

Les requêtes du pont expirent après un délai borné ; une écriture expirée ne doit pas être répétée automatiquement : son résultat est inconnu.

**Alertes Dolphin bloquantes.** Un « PanicAlert » Dolphin (par exemple « IOS : impossible de lire un fichier requis pour les services SSL (…/Wii/clientca.pem) », déclenché par SSA au moment de la sauvegarde) met l'émulation en pause jusqu'à un clic sur OK : le pont devient muet et les scripts échouent en « bridge timeout ». Le profil de recherche règle donc `UsePanicHandlers = False` dans `[Interface]` de `Dolphin.ini` (écrit par `initializeProfile`, et ajouté à la main dans le profil existant le 12 septembre 2026) ; les alertes vont dans le log. Les chargements lourds (69 Mo de `Title.arc`) peuvent aussi immobiliser les frames plusieurs secondes : attendre par tranches et tolérer quelques dépassements consécutifs avant de conclure à un blocage.

### Piège des descripteurs Riivolution sous Windows

Dolphin ne découpe le chemin du XML que sur `/` (et `:` sous Windows) pour trouver le dossier de référence des fichiers `external` relatifs. Un chemin avec des antislashs donne le dossier racine `C:` et chaque remplacement de fichier devient silencieusement un non-événement : aucun log, le jeu démarre avec les fichiers du disque. `buildDescriptor` écrit donc tous les chemins avec des `/` ; un test unitaire le vérifie. Un « démarrage réussi » d'un descripteur ne prouve jamais qu'un fichier a été remplacé.

Deuxième règle, apprise lors du premier essai M1 : un `external` **sans** `/` initial se résout par rapport au **dossier du XML** (ou à l'attribut `root` du `<patch>`), un `external` **avec** `/` initial par rapport à la racine du descripteur (`root` du JSON). Un XML rangé dans `riivolution/` avec des fichiers dans `files/` doit donc écrire `external="/files/…"`, sinon le fichier est introuvable et le jeu sert l'original ; le moniteur de fichiers l'a montré (52 733 kB servis au lieu de 52 735). `tools/ssa-archive` génère la forme absolue.

## Preuves obtenues

Les fichiers locaux `m0-proof.json`, `live-test.json`, `patch-test.json`, `calls.jsonl`, les captures PNG et les logs Dolphin contiennent les résultats détaillés. Un PASS d'appel signifie que l'appel a répondu ; les preuves de gameplay ci-dessous reposent sur des captures et des observations distinctes.

| Vérification | Résultat |
| --- | --- |
| Négociation MCP et découverte des 35 outils | PASS |
| Rejet d'une écriture hors RAM | PASS |
| Transport fragmenté, précision 64 bits, timeout, bornes RAM, conflit de port, chemins de descripteur | 6 tests automatisés |
| Lancement du WBFS par le MCP, ping, identifiant `SSPP52` et entier dépassant 2^53 | PASS |
| Réécriture des mêmes 8 octets suivie d'une relecture exacte | PASS ; aucun changement logique de données |
| Portal émulé détecté | PASS dans les logs USB (`1430:0150`) |
| Figurine chargée par `dolphin_load_figure`, reconnue par le jeu | PASS ; Sonic Boom affiché avec nom et barre de vie dans le premier niveau |
| Effet des entrées Nunchuk et relâchement dans une scène jouable | PASS ; déplacement visible puis arrêt après la fin du maintien |
| Sauvegarde native en pleine partie, évolution, restauration | PASS ; slot 9, fichier d'environ 38 Mo, scène restaurée observée par capture |
| Pause et reprise natives | PASS, vérifiées par la barre d'outils |
| Remplacement Riivolution effectif | **PASS** : même fichier `hbm/config.txt` servi à `0 kB` au démarrage témoin et à `61 kB` au démarrage patché (fichier externe de 61 447 octets), moniteur de fichiers Dolphin, deux instances distinctes |
| Jeu patché toujours fonctionnel | PASS ; écran rendu après le démarrage, figurine chargée dans le slot 1 par le MCP |
| Fermeture des instances test | PASS sans terminaison forcée sur le dernier essai ; une terminaison forcée reste signalée quand elle survient |
| Intégrité de la figurine originale | PASS ; SHA-256 `15fee6e0…8cff39` identique avant et après |

Une première preuve par marqueur ajouté en fin de fichier et recherché en RAM a été abandonnée : le jeu ne conserve que la première ligne analysée, donc l'absence du marqueur ne prouvait rien. La preuve retenue mesure la taille servie par le système de fichiers du disque patché.

## Critères M0 et verdict

- Démarrer SSA depuis une nouvelle session MCP et identifier le bon dump et le bon profil : fait.
- Atteindre une scène jouable avec un Skylander reconnu, puis démontrer l'effet des entrées Wiimote/Nunchuk et leur relâchement : fait.
- Capturer cette scène et ses logs ; sauvegarder, faire évoluer la scène, restaurer et vérifier le retour attendu : fait.
- Confirmer la lecture du fichier externe dans un essai Riivolution traçable, dump original conservé : fait.
- Résultats reproductibles pour les commandes requises, fonctions non prises en charge identifiées : fait (voir limites).

**M0 : PASS.** Aucun reader/writer IGA ni éditeur de niveau n'a été implémenté pendant cette étape. Limites restantes : pas de pas-à-pas exact, pont muet pendant la pause native, outils natifs dépendants du bureau interactif et de la langue de l'interface, `dolphin_reset` non validé.

## Reproduction

Depuis `tools/dolphin-mcp` :

```powershell
npm ci --ignore-scripts
npm test
npm run smoke
node live-test.mjs
node live-test.mjs --patch
node prepare-m0-patch.mjs
npm run proof
```

`live-test.mjs` écrase le slot **9 du profil de recherche uniquement**, lance SSA puis ferme sa propre instance. `--patch` nécessite le XML et le fichier original extraits dans `.local/riivolution-smoke`. `prepare-m0-patch.mjs` régénère le fichier de remplacement, le XML et le descripteur dans `.local/riivolution-proof/` ; `npm run proof` enchaîne le démarrage témoin, le démarrage patché, la vérification de la taille servie, le rendu, le chargement de la figurine et l'arrêt, puis écrit `m0-proof.json` et met à jour `manifest.json`. Chaque script retourne un code non nul en cas d'échec.

`setup.ps1 -Register` réinstalle le runtime versionné, les dépendances verrouillées et la connexion Codex. Ne pas l'utiliser pour écraser une autre connexion MCP appelée `dolphin` sans vérifier sa destination. Le WBFS, les figurines, les saves et les preuves ne font pas partie du code distribué.

## Sources d'intégration

- [Fork Felk et chargement des scripts](https://github.com/Felk/dolphin)
- [Release scripting-preview4](https://github.com/Felk/dolphin/releases/tag/scripting-preview4)
- [Interfaces Python de cette version](https://github.com/Felk/dolphin/tree/scripting-preview4/python-stubs/dolphin)
- [MCP communautaire réutilisé pour les outils de base](https://github.com/dmang-dev/mcp-dolphin)
- [Format du descripteur Riivolution dans le runtime](https://github.com/Felk/dolphin/blob/scripting-preview4/Source/Core/DiscIO/GameModDescriptor.cpp)
- [Résolution des fichiers externes Riivolution (`FileDataLoaderHostFS`)](https://github.com/Felk/dolphin/blob/scripting-preview4/Source/Core/DiscIO/RiivolutionPatcher.cpp)
- [Moniteur de fichiers Dolphin](https://github.com/Felk/dolphin/blob/scripting-preview4/Source/Core/Core/HW/DVD/FileMonitor.cpp)
- [Configuration MCP de Codex](https://developers.openai.com/codex/mcp)
