# Implemented model

Addition: a new stable identifier, source (level + placement/model), finite position [x,y,z], orientation/scale, confirmed recipe version. No existing victim/target is used as the copy's identity.

Recipe: game/revision, the required digests, the required assets/contexts, limits, evidence and confidence. Only CONFIRMED makes a source addable. Handler hypotheses stay UNKNOWN/LIKELY and not editable.

Lifecycle: requested → validated → persisted → observed. Undo/Redo acts on a distinct creation; Reset returns to the opened level, including the additions that were already present when it was opened. The IGZ bytes keep their size. A companion file `<level>.portalforge.json` version 1 holds `base_sha256` and `additions`: `{id, source, model, position, heading, scale}`. The identities are negative int32 values, distinct from the offsets of the original objects.

The patch contains the rebuilt archive, the existing Riivolution descriptor and `portalforge-additions.ini` together with its JSON manifest/digest. The launcher installs the Gecko codes temporarily in the research profile only and restores its files after a confirmed stop. The Riivolution descriptor alone does not load the additions: use the editor's launcher. Both the IGZ digests and the additions take part in invalidating a stale save or patch.

Evidence: game/source/patch identified by digests, 2 identical runs, consumption proven, source and witnesses preserved, a distinct new instance and the observed position.

Families extension: scripted additions also keep `script` (the offset of the validated asset) in the sidecar. The compiler and the reopening check that it matches the exact recipe. `native-recipes.json` references the finding by source/model/script; unconfirmed sources stay candidates.

`Compatibility`: `{status,label,reason,available,testable,family,checks,report}`. The family key is a SHA256 of the probe version, of the level's SHA, of the archive, of the model/script assets and of the scale. The report names the source that was actually tested; it does not authorise the other parameters of that family.

`ValidationBatch`: identifier, source/INI digests, recipes, candidates, runs and a completed/failed/cancelled state. Each run holds captures and intermediate/final observations per source, the stop and the profile restoration. `runtime`, `visual` and `gameplay` are kept separate. `observed_live` marks a creation that was observed even if the actor does not survive to the last capture. A technical result modifies no finding.

The native observations expose `position`/`heading` (initial transform), `current_position`/`current_heading` (current transform), `actor_parameters` and `local_variables`. The script may move/animate the current transform without invalidating the patch's initial destination. Non-null actors and own states must be distinct between copies; a shared script asset is expected. The campaign version `native-family-v2-observer-ready` separates the results of the early trigger from those of the deferred recipe.

The published capacity is eight additions in total. `addition_capacity:{used,limit}` is computed from the session and refreshed after an edit/history change. The nine exact sources are referenced by `native-recipes.json`, with no implicit promotion of families.

A launch carries `skip_intro` (boolean, default false). It is a run option, not a level edit and not a cache key. The browser remembers the choice in `portalforge.skipOpeningCinematic`, keeps it while switching to manual mode, but sends false in that mode. The settings are disabled during a launch.

`LevelEntry` version 1: normalised archive, phase `before-level-load`, `clean_native:true`, the savestate's SHA256, FST table `{address,length,sha256}` and `binding:{game,runtime,bridge,figure,configuration,layout}`. The cache is local, indexed by the binding's digests. `layout` holds the paths and sizes of the replacements; changing the content with an identical layout is allowed, because the level's bytes are re-read after the transition. A different layout forces a new preparation. The real FST table must match before and after resuming. Slot 8 of the research profile is temporary and restored after a confirmed stop.
