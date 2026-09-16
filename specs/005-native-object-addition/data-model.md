# Modèle implémenté

Addition : identifiant stable nouveau, source (niveau + placement/modèle), position finie [x,y,z], orientation/échelle, version de recette confirmée. Aucun victim/target existant utilisé comme identité de copie.

Recipe : jeu/révision, empreintes nécessaires, ressources/contextes requis, limites, preuves et confiance. Seul CONFIRMED rend une source ajoutable. Les hypothèses de handler restent UNKNOWN/LIKELY et non éditables.

Lifecycle : requested → validated → persisted → observed. Undo/Redo agit sur une création distincte ; Reset revient au niveau ouvert, y compris les ajouts déjà présents lors de son ouverture. Les octets IGZ gardent leur taille. Un fichier associé `<level>.portalforge.json` version 1 conserve `base_sha256` et `additions` : `{id, source, model, position, heading, scale}`. Les identités sont des int32 négatifs, distincts des offsets des objets originaux.

Le patch comprend l'archive reconstruite, le descripteur Riivolution existant et `portalforge-additions.ini` accompagné de son manifeste JSON/empreinte. Le lanceur installe temporairement les codes Gecko dans le seul profil de recherche et restaure ses fichiers après arrêt confirmé. Le descripteur Riivolution seul ne charge pas les ajouts : utiliser le lanceur de l'éditeur. Les empreintes IGZ et ajouts participent toutes deux à l'invalidation d'une sauvegarde ou d'un patch périmé.

Evidence : jeu/source/patch identifiés par empreintes, 2 runs identiques, consommation prouvée, source et témoins conservés, nouvelle instance distincte et position observée.

Extension familles : les ajouts scriptés conservent aussi `script` (offset de la ressource validée) dans le sidecar. Le compilateur et la réouverture vérifient sa concordance avec la recette exacte. `native-recipes.json` référence le finding par source/modèle/script ; les sources non confirmées restent candidates.

`Compatibility` : `{status,label,reason,available,testable,family,checks,report}`. La clé famille est un SHA256 de la version de sonde, du SHA du niveau, de l'archive, des ressources modèle/script et de l'échelle. Le rapport précise la source effectivement testée ; il n'autorise pas les autres paramètres de cette famille.

`ValidationBatch` : identifiant, empreintes source/INI, recettes, candidats, runs et état completed/failed/cancelled. Chaque run contient captures et observations intermédiaires/finales par source, arrêt et restauration du profil. `runtime`, `visual` et `gameplay` sont séparés. `observed_live` indique une création observée même si l'acteur ne reste pas jusqu'à la dernière capture. Un résultat technique ne modifie aucun finding.

Les observations natives exposent `position`/`heading` (transform initial), `current_position`/`current_heading` (transform courant), `actor_parameters` et `local_variables`. Le script peut déplacer/animer le transform courant sans invalider la destination initiale du patch. Les acteurs et états propres non nuls doivent être distincts entre copies ; une ressource de script commune est attendue. La version de campagne `native-family-v2-observer-ready` sépare les résultats du déclenchement précoce et de la recette différée.
