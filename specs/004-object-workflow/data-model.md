# Modèle de données

- CatalogEntry : offset local, nom, modèle, calques, catégorie, disponibilité/motif. Identité propre à la session ; homonymes conservés.
- DropIntent : source, target, position XYZ finie ; orientation/échelle source ; aucun allow_scripted.
- PreparedDrop : jeton aléatoire, révision octets/historique, intention figée, plan/règles. Une préparation par session, aucune mutation.
- CommittedDrop : une édition replace ; undo/redo exacts ; jeton consommé après succès.
- MeshLibrary : géométrie du même niveau associée aux modèles avant remplacement, immuable pendant les éditions de placement. Réutilisation locale par chemin non ambigu quand un record partagé est renommé ; décor conservé, aucun writer de géométrie.
- Futur ImportManifest : provenance/hashes source-cible, dépendances connues/inconnues, mode réutilisation/import, gates/preuves.
- Futur LevelEntryStrategy : niveau, jeu/runtime/configuration/patch/état et hashes, transition, preuves ; invalidation sur changement.
