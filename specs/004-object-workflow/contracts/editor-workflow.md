# Local API — batch 1

The placement-v1 contract is unchanged.

- GET /api/catalog → {entries:[{offset,name,model,layers,category,available,reason}]}. Every placement.
- POST /api/catalog/prepare {source,target,position:[x,y,z]} → {token,plan,rules}. An eligible source, a runtime map, an identical size, a finite position and a valid plan are required. Neither bytes nor history are modified. Every rule is returned.
- POST /api/catalog/commit {token,acknowledged:[ruleId]} → the existing result + rebuild_scene:true. Unknown/stale token, locked session or a missing critical acknowledgement: 409. The intent comes from the server only.
- replace/undo/redo return rebuild_scene when the models have to be rebuilt. The client reloads placements/meshes before the next action.
- POST /api/reset {} → session state + {applied,reset_scene:true,rebuild_scene:true,reset_count}. Undoes every edit back to the opened file, preserves Redo including the edits that were already undone, invalidates the preparations in progress and detaches saved/patched (null). No file is deleted or overwritten. SESSION_LOCKED (409) if the session is locked or Dolphin is active. Repeating it with no applied edit is allowed (reset_count:0) and keeps Redo.

The messages meant for the interface are in English. The client asks for confirmation before /api/reset, blocks concurrent operations and reloads placements/meshes/catalogue, visibility and framing after a success.

GET /api/placement/:offset gives the candidates without guaranteeing the final plan. Cancelling commits nothing; a new preparation invalidates the old one.
Tests: exhaustiveness, refusals, preparation without mutation, critical rules, source preserved, chosen victim, staleness, locking, one edit and exact undo/redo.
