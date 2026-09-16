# Implementation Plan: Ajout réel d'objets

**Branch**: main (dossier 005 indépendant) | **Date**: 2026-09-16 | **Spec**: [spec.md](spec.md)

## Summary

Créer une instance native supplémentaire sans victime. Rechercher le clonage du moteur avant d'exposer Add dans l'éditeur. Le remplacement confirmé de 004 reste distinct ; aucune copie exclusivement visuelle ne satisfait US1.

## Technical Context

- Node.js 24, modules ES, Three.js et éditeur existant ; Python embarqué Felk pour observations runtime.
- Plateforme Windows, SSA Wii SSPP52 Rev1, profil Dolphin dédié .local/.
- Stockage : rapports et captures .local/ ; specs et findings sans données protégées dans Git.
- Tests : node --test, navigateur Edge par CDP, observation RAM + rendu sur deux démarrages identiques.
- Périmètre : une décoration déjà chargée dans le tutoriel, puis identité et historique des ajouts.
- Performance : aucun instrument de trace actif dans le parcours utilisateur ; instrumentation bornée pour recherche.
- Inconnues moteur : appel natif de création, contexte/arguments/ownership et persistance via patch. Ce sont des tâches de recherche, pas des décisions utilisateur non précisées.

## Constitution Check

M0..M3 PASS vérifiés ; M4A/M4B/M5 UNKNOWN. Recherche et observations autorisées. Aucun writer de nouvelle géométrie/collision. Pas d'insertion IGZ ou de détournement de victime présenté comme ajout. Aucune propriété UNKNOWN déclarée éditable. Un éventuel patch moteur exige sa propre preuve et son compte rendu avant intégration. Sources du jeu et Dolphin personnel intacts. Les essais passent par le MCP et les profils .local/.

## Phase 0 — Recherche

1. Conserver le correctif d'accessibilité 004 et sa preuve clavier.
2. Auditer les anciens échecs et inventorier les opcodes clone de scripts existants.
3. Identifier le handler natif dans MEM1, ses paramètres et un appel témoin observable ; délégué en lecture seule à native_clone_research.
4. Observer la création native dans Dolphin sans édition de niveau ; déduire une expérience minimale réversible, vérifier les ressources et le cycle de vie.
5. Démontrer une instance supplémentaire, source et témoins conservés. Prouver la persistance sur deux boots identiques avant de déclarer la recette CONFIRMED.

## Phase 1 — Contrat conditionnel

Voir data-model.md et contracts/addition.md. Le contrat décrit le résultat requis mais aucun endpoint d'ajout n'est activé avant la preuve. Reprendre le système de transactions/historique existant une fois la représentation persistante connue.

## Project Structure

- specs/005-native-object-addition/ : spec, plan, recherche, modèle, contrat, quickstart, tâches.
- tools/ssa-archive/research-probes/ : sondes de clonage et inspection, sans données du jeu.
- .local/object-workflow/ : audit existant ; .local/native-addition/ : analyses et essais isolés.
- tools/ssa-archive/src/editor/ et src/view/ : intégration uniquement après preuve runtime.
- docs/findings/records/ : findings avec confiance et preuves exactes.

## Complexity Tracking

Extension diagnostic : classifier en lecture seule par modèle, script et contexte ; résultats indexés par empreinte des ressources et version de recette. Une campagne dédiée utilise des copies de session, choisit un représentant par famille et produit un résultat par candidat, même en cas d'échec. Le test natif des sources scriptées conserve leurs scripts ; aucun comportement nouveau n'est inventé et aucune absence de contrôle visuel n'est cachée. Les contrôles techniques automatisés ne deviennent jamais seuls une confirmation de rendu/gameplay.

Constitution 1.1.0 : le patch Riivolution conserve les remplacements d'archives ; un accompagnement Gecko temporaire porte la recette native confirmée, sans insertion IGZ. Raison : la création exige le factory natif et ne peut pas être représentée par un simple append de record. Finding `level.prop.native-addition`, deux boots identiques, contexte borné et restoration du profil. Aucun avancement de M4A/M4B/M5.
