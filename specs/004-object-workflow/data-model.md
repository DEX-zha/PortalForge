# Data model

> Scope reviewed 2026-09-17: this feature records its original design and evidence. Later extensions and
> remaining work are mapped in the [specification status](../README.md); historical limits below are not the
> current editor limits.

- CatalogEntry: local offset, name, model, layers, category, availability/reason. Identity local to the session; homonyms are kept.
- DropIntent: source, target, finite XYZ position; source orientation/scale; no allow_scripted.
- PreparedDrop: random token, byte/history revision, frozen intent, plan/rules. One preparation per session, no mutation.
- CommittedDrop: one replace edit; exact undo/redo; token consumed after success.
- MeshLibrary: geometry from the same level associated with the models before the replacement, immutable during placement edits. Local reuse by unambiguous path when a shared record is renamed; scenery preserved, no geometry writer.
- Future ImportManifest: source-target provenance/hashes, known/unknown dependencies, reuse/import mode, gates/evidence.
- Future LevelEntryStrategy: level, game/runtime/configuration/patch/state and hashes, transition, evidence; invalidated on any change.
