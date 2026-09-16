# Research: native creation

## Decision

Study the native handler of the script instruction `clone||at|facing||cloned`. Observe its real calls before attempting to create an object. The persistent representation of the patch remains to be determined; no Add route is enabled before evidence.

## Results and alternatives

- **CONFIRMED (existing scope)**: a visible copy through a same-size replacement; not enough for the requested addition. See docs/format/igz-level-editing.md and docs/m3-status.json.
- **LIKELY (loader model)**: count-bounded record walks and blob walks explain why insertions hang. Earlier appends may stay raw, with no construction. Findings `igz.loader.head-span-count-walk`, `igz.loader.blob-walk-stomps-insertions`.
- **LIKELY (historical audit)**: lists assumed to be free are not a validated reserve; 609 lists derived from runtime pointers had no free capacity. Finding `igz.detection.heuristic-limits`.
- **LIKELY (local inventory)**: 85 scripts tied to placements contain 592 clone-instruction references in their lists. Instructions can be shared: these are neither 592 executed calls nor 592 new instances. `.local/object-workflow/addition-audit.json`, source SHA256 `2976f3597df5f7aa8f3ba564b6f54c6170a08cabb204753d2bf3c70206a32e3f`, file unchanged. Bridge/cannon assets and the Barrel were found again.
- **UNKNOWN**: the context needed to invoke creation on demand, ownership of the result, identity/name, preservation of the assets and application after every boot.

Editor-only copies were explicitly rejected by the user. Automatically replacing a distant object does not satisfy the requirement either.

## Instrumentation

### Native handler identified by read-only inspection (T004)

The record `clone||at|facing||cloned` at file offset `0x1b1f5c` corresponds, in the historical scene-pose reading, to `0x80f6df7c`. Its vtable `0x80486514`, slot `+0x78`, leads to `0x800444f4`. The call at `0x800445c4` enters `0x80041984`; execution resumes at `0x800445c8`. Likely arguments: r3 the resolved source, r4 an XYZ pointer, r5 an **orientation expression object**, not a float. Return r3 the instance or null. `0x80044164` is a dispatcher, not a creation API.

The range `[0x80041984,0x80041b74)` is identical in three independent dumps (SHA256 `8fcf8ff29324baff5246ef8dbf3dcab41c983941b8ac603b7554fff8bd2b42a3`). It allocates, copies through the class metadata, writes XYZ and source/activator, then activates the new instance. The execution fields and the clone list are not copied by the observed copy policy; a specific method rebuilds the collision/actor parameters. This decoding stays **LIKELY** and not editable; no collision property is validated by this reading.

The script-less sunflower shares the bridge's class in the dump. Unknowns: the effect of the preserved ID, the global context, the lifetime and the persistent export. No memory area assumed to be free is allowed as a code cave. Local reports: `.local/object-workflow/native-clone-research.json`, `native-clone-protocol.md`. The next step observes the native calls without altering their arguments.

Felk scripting-preview4 exposes breakpoint events and reads/writes of general-purpose and floating-point registers, but the current MCP bridge does not expose those operations. Check the effective configuration before any instrumentation. Primary sources: [event.pyi](https://github.com/Felk/dolphin/blob/scripting-preview4/python-stubs/dolphin/event.pyi), [registers.pyi](https://github.com/Felk/dolphin/blob/scripting-preview4/python-stubs/dolphin/registers.pyi). A documented API does not prove a working connection or callback.

### Native control observation (T005)

Run `.local/native-addition/observe-1789510647445`: 2 580 entry/return lines, with no modification of the archive and no modification of the arguments. The source bridge `0x80f6dfc8` is passed with XYZ at `0x80f85dd0` and an orientation expression at `0x80f43bc8`. Return `0x81229d70` at `0x800445c8`. The MEM1 reading finds that instance active, parent/source `0x80f6dfc8`, activator `0x80f85d94` and position `[-6.096,5.473598,-19.964399]`. The code digest matches T004. Tutorial reached, captures kept, closed without a forced kill and configuration restored.

This validates targeting the **existing** call, not the editor's ability to add. The extra run stays separate.

### Exploratory call and the persistence studied

Felk's GDB debugger works under Windows and gives PC/LR/GPR/FPR-PS0. The bundled `G` command has a read offset in this version; the probe uses `P` individually and compares the restored context. PS1 is not exposed; the experiment happens at the native call boundary, where volatile registers are not preserved by the ABI. Source: [GDBStub.cpp](https://github.com/Felk/dolphin/blob/scripting-preview4/Source/Core/Core/PowerPC/GDBStub.cpp), [CPU.cpp](https://github.com/Felk/dolphin/blob/scripting-preview4/Source/Core/Core/HW/CPU.cpp).

Gecko C2 is a **Dolphin**-side patch lead, with no IGZ insertion: its handler explicitly reserves `[0x80001800,0x80003000)`, with 3 256 bytes available for codes in the verified local runtime. That does not mean those addresses are free outside the handler. The local probe targets the return after the original call, keeps its result and limits the extra call to a single attempt per boot. Activation, result, resuming and export remain to be proven. Source: [GeckoCode.h](https://github.com/Felk/dolphin/blob/scripting-preview4/Source/Core/Core/GeckoCode.h), [GeckoCode.cpp](https://github.com/Felk/dolphin/blob/scripting-preview4/Source/Core/Core/GeckoCode.cpp), [codehandler.s](https://github.com/Felk/dolphin/blob/scripting-preview4/docs/codehandler.s).

### First exploratory results: a visual failure kept on record

- GDB: two runs interrupted cleanly, before any extra call. The first was stopped after the `G` defect was identified; the second slowed the macro badly (the user reported it too) and stayed in the menus. GDB was dropped from the later rendering runs. The temporary settings were restored.
- Early Gecko, `.local/native-addition/gecko-1789511665997`: branch consumed in memory, guard going from 0 to 2, new pointer `0x8122a164`, source `0x81105604`, position `[91.349,10.435,43.275]`, actor `0x8122f35c`. The bridge original `0x81229d70` stays distinct. The source now has a clone list. The tutorial is playable at normal speed, closed without a forced kill.
- **Visual criterion failed**: the new plant does not appear at the destination where an earlier replacement was visible. The model is linked and the actor matrix carries the right position; that therefore does not prove rendering. Differences observed: heading 0 instead of 285, activationRange 0 instead of 180, creation before the source is activated, and an activator inherited from the bridge. None of those gaps is established as the cause yet.
- Next variant: wait for an active source with a created actor, and supply a native orientation expression in the handler's reserved data. A positive memory result is still not enough to enable Add in the editor.

### Confirmed additive recipe (T006)

The late runs `gecko-1789512135253` and `gecko-1789512594054` show a copy visible in addition to the two initial sunflowers. The recipe generalised to two entries is then identical in `gecko-1789513063448` and `gecko-1789513507766`: INI SHA256 `98b4c2f8913f272b4de87fba1bb9e38d9a8892f5d3504169aaa0061b95c604ec`. Four sunflowers visible, weed preserved, two new distinct instances/actors and four actors in the model's graph. Positions `[91.349,10.435,43.275]` and `[89.049,10.435,43.275]`, orientations 285° and 240°. Two cold boots, normal macro and movement, closed without force, configuration restored.

Formal local proof: `.local/dolphin-evidence/experiments/native-addition-two-boots-20260916.json`. Finding `level.prop.native-addition` CONFIRMED, editable within that scope only. The probe's `originalPointer` field is not enough to prove preservation: the native object may be temporary; the proof uses the initial sunflowers, their actors and the bridge as a witness.

Recipe: C2 at the return `0x800445c8`, a re-entrancy guard, waiting for the source to be active with an actor, a call to `0x80041984`, a private native expression for the heading through `0x8005c4d0`, then resuming the instruction `mr r29,r3`. No IGZ insertion. The compiler preserves general-purpose registers, the control registers and volatile PS0 at that ABI boundary; it does not claim to save PS1. A negative int32 addition identity, PFNA data, the state and the result pointer are verified separately. The factory's full digest is checked at boot.

Limits: SSPP52 Rev1, the tutorial and file source `3446244` (`plant_sunflower_whole.mdl`), two additions at most, scale 100 %. Movement and orientation validated. A fresh emulation boot is needed after a patch change or a level reload; the guard persists for the duration of one emulation. The other sources, scripts, imports and collision changes stay unavailable. The precise cause of the early failure is not isolated: initialisation and orientation changed together.

### Families and Barrel extension (T014–T018)

The flowers' "active source with an actor" guard excluded scripted templates, which are often inactive with no actor. The extended probe waits for the witness sunflower `0x81105604`, then checks the class, the model, the null parent and the exact script of the candidate source. The factory preserves that script. The recipes are indexed by source/model/script and by finding; no approximate name is enough.

- `1_Coper(1)` source 3034548, model 3036352 `Treasure_Coin_A.mdl`, script 3034796 `Placed_Loot_Spinning.ai`: a non-null factory return, but no matching live actor at the final reading of batch `batch-1789515615448-b064d7e3`. Cause UNKNOWN; do not claim a successful pickup.
- `Enemy_ChompyNipper` source 2390540, model 1214412, script 2348068: the same lifetime uncertainty in `batch-1789515929960-66501f94` and `batch-1789516240184-d7e23442`. No combat validated.
- `Barrel` source 3983352, model 2794492, script 2739632: a distinct actor, initial position `[90,10.5,48]`, heading 0 and visible rendering in both of the last identical batches (INI `46a58bd5acceef25c08a9a6f7ec49d3becf38b2b18fecae508ee04b3de9f3e9a`). The isolated batch `batch-1789517137901-64e9eaf6` confirms that result with no other source requested. Finding `level.prop.native-addition-barrel` CONFIRMED; formal experiment `native-barrel-two-boots-20260916`.
- Lifecycle control: two identical boots of `batch-1789516571830-61dbcec2`, Barrel alone at `[95.5,10.5,43]`, show the Barrel during the dialogue (`34-tutorial-hugo-3`), then its disappearance before the last capture. Visible creation proven; the cause of the disappearance is UNKNOWN. A final inspection alone therefore gave an incomplete diagnosis.

The campaign now reads memory at each tutorial capture and keeps the whole sequence. The launcher distinguishes a verified scripted creation followed by a changed final state; it does not relax the final check for static decorations. The reports validate neither the rendering nor the gameplay automatically. The tests do not touch the open scene. M4A/M4B/M5 stay UNKNOWN.

### Priority investigation into enemies/loot (T019–T022, confirmed scope)

The audit of the original sources finds 8 placements sharing `Enemy_Chompy.ai` (IDs 0/1), 41 placements sharing `Placed_Loot_Spinning.ai` (ID 1) and 25 sharing `Barrel.ai` (ID 0). Each one has a distinct `_actorParameters` block. Repeating the script or the ID field alone therefore does not establish a copy conflict. The native metadata shows that `_execBehavior` (+ac) and `_localVarList` (+b0) are execution state that is not copied, whereas `_script` (+a8) and `_ID` (+20) are copied; the native copy rebuilds the actor parameters. This remains a reading of the mechanism, not proof that it works for enemies.

Control `batch-1789559355785-de449061`: a Chompy at `[90,10.5,48]`, a coin at `[88,10.5,43]`, scripts unchanged. Both identical boots show the allocations freed/reused at the first tutorial capture, before the macro's last combat inputs. The earlier position near the player does not explain the failure on its own.

Probe `lifecycle-1789560103836`: a bounded 0xf8-byte snapshot taken immediately on the factory's return finds **both copies active (state 1), with distinct actors and the requested XYZ**, their own actor parameters and the script preserved. The Chompy has a local variable list; the coin has none at that moment. The global activity context is 0. The objects are already destroyed/reused at the `intro-cinematic` reading. That result rules out a simple allocation failure or the initial absence of an actor, but validates neither the rendering nor the behaviour. Data and exploratory code stay in `.local/native-addition/`.

The trace `lifecycle-1789560836291` records for both copies a **state 2** request, LR `0x80062b88`, null VM context: the activation-distance manager calls `0x80042018` at `0x80062b84`. Deactivation removes a clone from its parent's list and leads to state 4/release. The first probe only watched requests 3/4 and had therefore recorded nothing; its lack of a trace was not an absence of deactivation. The original activation distances are 150+20 for the Chompy, 140+0 for the coin, 0+0 for the Barrel. Diagnostic finding `level.prop.native-addition-activation-lifecycle`, not editable.

Variant `lifecycle-1789561087535`: the factory call is moved to the return of the activation manager `0x80062b88`, after a non-empty native observer list (`r30`, saved at `sp+0x80`) and the tutorial anchor are available. The copies are absent from the first intro capture, then active with their own actors/parameters; the coin is animated and the Chompy visible and moving in the following captures. The sources, IDs, scripts and distances stay unchanged. The Chompy's later removal this time uses a behaviour instruction (request 3, LR `0x80041d40`); this is not the early-creation defect. Its precise gameplay cause is not extrapolated.

The transform check now reads `_initMatrix` at +24/+34 for the requested position/rotation and reports `_currentMatrix` at +3c/+4c separately: the AI and a coin's rotation can change the second one. A divergence in the initial position, a replaced script or shared actor parameters are still failures. The digest of the non-instrumented part of the manager `[0x80062860,0x80062b88)` is `77ce73ad478b451bf6bf01c67104fbc439e5dc5a09818351bcf36babc9cd0b18`.

Mixed control `regression-1789562330193` then `regression-1789562705974`: the Barrel is visible and both actors verified in memory, but the sunflower copy at `[88,10.5,43]`/0° cannot be made out in the final capture. That batch is not a visual PASS for both objects. Context, orientation and visibility at that destination were not isolated as the cause. As a precaution, the compiler now composes the already validated static hook and the deferred script hook, instead of forcing the latter on both objects. The PPC words of each part are identical to its isolated compilation; the global limit of two copies, distinct IDs and the shared Gecko capacity are all checked. The next control reuses for the sunflower the transform `[94.169,10.438,40.5]`/285° of the previously validated browser run.

Final control: both boots of the corrected mixed batch show the Barrel and sunflower copies at the same time, with distinct actors and the originals preserved. Results and digest in validation.md.

### Eight-addition and direct-entry extension

The compiler produces 2 344 bytes for eight mixed additions, under the reserved capacity of 3 256. The capacity went from two to eight after the two identical boots `eight-1789587878940` and `eight-1789588179478`, with eight distinct instances and a visual check. The five new sources are confirmed individually; their family alone does not confirm them.

Resuming the original disc's state on the Riivolution virtual disc (`entry-probe-1789586871201`) reads the wrong archives and stays black. The FST table must match the active disc; the next checkpoint is therefore prepared with a patched descriptor. The new FST is identical before/after restoring (`e65c452e0bb74ec47925572fbbf325d644fe64ededb6f53abb59bfe78ac037c4`). A second attempt (`entry-probe-1789587379824`) stays on the menu: an identical FST is not enough to validate that the devices resume. Both instances were stopped and the profile restored.

The control `entry-control-1789587598495`, with no native codes, loads the figure before restoring, waits five seconds, reconnects the Wiimote and holds A for 60 frames. The tutorial and the patched archive at 15 333 kB are observed; the after-a capture shows Flynn and the islands. The next native attempt (`entry-probe-1789587704908`) also reaches Hugo's scene with the extra sunflower, but was interrupted before the end of the macro and before the Barrel's creation was confirmed. It stays incomplete, not a PASS. The caches must tie together the state, the game, the runtime, the configuration and the disc layout; the level's new bytes must be re-read after restoring. Preparation runs with no active codes so that old additions are not imported.

Two complete direct runs `direct-production-1789588758037` and `direct-production-1789588987701` confirm resuming on the same virtual disc with different bytes. The checkpoint holds the rebuilt original archive; the launch uses the replacement of the weed by a sunflower, archive SHA256 `bfd5b0f618ee755332b3c7712dcc6b054054aea51c6689276e127dd35bb1cad1`. The native position at source 3452000 is `[94.119,10.438,40.461]`, distinct from the original `[91.444,10.69,33.882]`. The two current Gecko additions have their own distinct actors and parameters, the tutorial is playable, Dolphin stops without force and the profile/slot 8 are restored. The first full control `direct-production-1789588478075` wrongly expected the source model's pointer: the replacement keeps the model record at the victim offset 3452336. That verification failure is not counted in the two PASS runs.
