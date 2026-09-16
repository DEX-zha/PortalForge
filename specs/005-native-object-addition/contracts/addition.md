# Contrat de résultat de l'ajout

`POST /api/edit` accepte `{kind:"add", source:3446244, position:[x,y,z]}`. Aucun paramètre de victime. La réponse fournit `placement.native_addition`, une identité négative, `rebuild_scene:true` et les profondeurs d'historique. `GET /api/placement/-1` fonctionne pour les copies ; `transform` accepte leur position et heading, pas leur scale.

`GET /api/catalog` annonce `addition_mode:"native"`, `entry.addition.{available,reason,status,label,testable,family,checks,report}` et `compatibility.{counts,families}`. Le Project utilise cette capacité pour Add ; les anciennes routes de remplacement restent explicites. Sources non confirmées : diagnostic et raison anglaise. Limite actuelle : deux copies au total issues du tournesol3446244 ou du Barrel3983352 validés, échelle 100%, tutoriel SSPP52 Rev1.

- Entrée : source, position finie, orientation/échelle dans le périmètre validé. Pas de victime.
- Résultat : identité nouvelle, transform résultant, historique et statut d'export. Aucun succès pour une copie seulement affichée.
- Refus : source/recette non confirmée, dépendance absente, session verrouillée, destination invalide, limite de création atteinte. Message anglais, état précédent conservé.
- La sauvegarde et le patch doivent reproduire l'ajout à froid ; une mutation RAM faite manuellement n'est qu'une preuve exploratoire.
- Critère de publication : nouvelle instance visible 2/2 boots, originaux conservés, preuve de consommation du même patch.

`POST /api/addition-validation` accepte `{sources:[offset]}` (une ou deux sources originales distinctes), verrouille la scène et retourne immédiatement `{running:true}`. Deux démarrages à froid vérifient les familles sans modifier la scène. `GET` fournit running/progress/result/error ; `POST /api/addition-validation/stop` demande l'annulation. Le niveau original est requis pour cette sonde.

`GET /addition-report/<family-sha256>` affiche le rapport et toute la séquence de captures du tutoriel. `GET /api/addition-report/<family-sha256>` fournit les données techniques et liens ; `/shot/<run>/<shot>` sert seulement les images locales du dossier de preuves. Ces rapports ne promeuvent pas automatiquement de finding.
