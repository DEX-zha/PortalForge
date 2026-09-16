# API locale — lot 1

Contrat placement-v1 inchangé.

- GET /api/catalog → {entries:[{offset,name,model,layers,category,available,reason}]}. Tous les placements.
- POST /api/catalog/prepare {source,target,position:[x,y,z]} → {token,plan,rules}. Source admissible, runtime map, taille identique, position finie et plan valide requis. Ni octets ni historique modifiés. Toutes les règles retournées.
- POST /api/catalog/commit {token,acknowledged:[ruleId]} → résultat existant + rebuild_scene:true. Jeton inconnu/périmé, session verrouillée ou critique manquante : 409. Intention issue du serveur uniquement.
- replace/undo/redo retournent rebuild_scene quand les modèles doivent être reconstruits. Le client recharge placements/meshes avant l'action suivante.
- POST /api/reset {} → état de session + {applied,reset_scene:true,rebuild_scene:true,reset_count}. Annule toutes les éditions jusqu'au fichier ouvert, préserve Redo y compris les éditions déjà annulées, invalide les préparations en cours et détache saved/patched (null). Aucun fichier supprimé ou écrasé. SESSION_LOCKED (409) si la session est verrouillée ou Dolphin est actif. Répéter sans édition appliquée est permis (reset_count:0) et conserve Redo.

Les messages destinés à l'interface sont en anglais. Le client demande confirmation avant /api/reset, bloque les opérations concurrentes et recharge placements/meshes/catalogue, visibilité et cadrage après succès.

GET /api/placement/:offset fournit les candidats sans garantir le plan final. Annuler ne fait aucun commit ; nouvelle préparation invalide l'ancienne.
Tests : exhaustivité, refus, préparation sans mutation, critiques, source conservée, victime choisie, péremption, verrouillage, une édition et undo/redo exacts.
