# Result contract for an addition

> Historical confirmed baseline (005): the eight-instance limit and source refusal below were superseded
> by [007 additions API](../../007-unlimited-additions/contracts/additions-api.md). The confirmed recipe scope
> remains nine exact sources and eight instances. Direct entry beyond the tutorial is covered by
> [006 levels API](../../006-multi-level-editing/contracts/levels-api.md).

`POST /api/edit` accepts `{kind:"add", source:3446244, position:[x,y,z]}`. No victim parameter. The response gives `placement.native_addition`, a negative identity, `rebuild_scene:true` and the history depths. `GET /api/placement/-1` works for the copies; `transform` accepts their position and heading, not their scale.

`GET /api/catalog` announces `addition_mode:"native"`, `addition_capacity:{used,limit:8}`, `entry.addition.{available,reason,status,label,testable,family,checks,report}` and `compatibility.{counts,families}`. Project uses that capacity for Add; the old replacement routes stay explicit. Unconfirmed sources: a diagnostic and an English reason. Current limit: eight copies in total drawn from the nine exact sources listed in compatibility.md, scale 100 %, SSPP52 Rev1 tutorial.

- Input: source, finite position, orientation/scale within the validated scope. No victim.
- Result: a new identity, the resulting transform, the history and the export status. No success for a copy that is merely displayed.
- Refusal: unconfirmed source/recipe, missing dependency, locked session, invalid destination, creation limit reached. English message, previous state preserved.
- The save and the patch must reproduce the addition from a cold boot; a RAM mutation done by hand is only exploratory evidence.
- Publication criterion: a new instance visible on 2/2 boots, originals preserved, proof that the same patch was consumed.

`POST /api/addition-validation` accepts `{sources:[offset]}` (one or two distinct original sources), locks the scene and returns `{running:true}` at once. Two cold boots check the families without modifying the scene. `GET` gives running/progress/result/error; `POST /api/addition-validation/stop` requests cancellation. The original level is required for this probe.

`GET /addition-report/<family-sha256>` shows the report and the whole capture sequence of the tutorial. `GET /api/addition-report/<family-sha256>` gives the technical data and the links; `/shot/<run>/<shot>` serves only the local images from the evidence folder. Those reports do not promote any finding automatically.

`GET /api/level-entry` gives `{supported,preparation}` for the open archive. `supported` requires the tutorial and the CONFIRMED/editable finding; the interface disables the direct choices elsewhere. The existing launch route also accepts `mode:"direct-test"|"direct-play"`. The preparation uses the current virtual disc before the native codes are installed, then the launch starts a new process. Progress: `preparing-entry`, `booting`, `restoring-entry`, `macro`, then `playing` or closing. An FST table mismatch produces an explicit failure; there is no silent resume onto a loaded state.

`POST /api/launch` accepts `skip_intro:boolean` (default false), passed to the launcher and kept in the launch's state/report. `true` requires the tutorial archive and the test/direct-test/direct-play mode; manual mode, another archive or a non-boolean value are refused before locking. The browser preference modifies neither the patch nor the entry cache. The pre-level preparation does not receive the skip. The optional macro waits for the archive and the start of the dialogue, sends C to the Nunchuk once, then keeps handling the prompts. Direct-play mode ends at the Skylander control marker, not at an index that became wrong once the steps were inserted.
