# Published illustrations

The user requested the README and image update on 2026-09-17. This curated set contains the logo, two editor
captures and six historical in-game frames. All other screenshots and game-derived artifacts stay in `.local/`.
The main editor image is the full user-supplied capture from 2026-09-18; the catalogue image is an isolated
browser capture. All images are copied byte-for-byte, without cropping, compositing or generated additions.

| File | Source and scope |
|---|---|
| [editor-workspace.png](editor-workspace.png) | Full user-supplied screenshot `Capture d’écran 2026-09-18 000330.png`: Level_021_Sheep, Whole game catalogue, a launch active in the interface. The screen itself does not verify creation or game behavior. |
| [editor-catalogue.png](editor-catalogue.png) | Isolated Mining session, Whole game search `Chompy`; foreign kinds are read-only. Source `.local/object-workflow/browser-1789682350507/editor-catalogue.png`. Local index: 8 800 kinds, 75 scenes. |
| [evidence-duplicated-sunflower.png](evidence-duplicated-sunflower.png) | Previously published frame from `editor-test-1789503985200`, the two-boot same-size replacement experiment. Preserved unchanged; see [003 quickstart](../../specs/003-placement-editor-3d/quickstart.md). |
| [evidence-native-additions-hugo.png](evidence-native-additions-hugo.png) | Previously published frame from `editor-direct-play-1789592930696`, tutorial additions near Hugo. Preserved unchanged; scope in [005 validation](../../specs/005-native-object-addition/validation.md). |
| [evidence-native-additions-combat.png](evidence-native-additions-combat.png) | Later frame from the same direct-play run. The filename is historical; the frame does not establish complete combat, collection or survival semantics. Preserved unchanged. |
| [evidence-mining-152-additions.png](evidence-mining-152-additions.png) | R1 boot 2, capture 11: `.local/dolphin-evidence/editor-direct-test-1789675647260-f7aa929c-11-redirect-arrived-3.png`. 152 factory-returned instances from three batches; 107 alive at the final reading. The frame alone cannot show that count. |
| [evidence-mining-enemy-templates.png](evidence-mining-enemy-templates.png) | E2 boot 2, capture 11: `.local/dolphin-evidence/editor-direct-test-1789672812252-5e9db3c3-11-redirect-arrived-3.png`. Six sources inspected in memory; observed fire/movement, not full combat proof. |
| [evidence-undead-volcano-live-table.png](evidence-undead-volcano-live-table.png) | L1 boot 2, capture 11: `.local/dolphin-evidence/editor-direct-test-1789674397828-eb0134fc-11-redirect-arrived-3.png`. Arrival on an initially unmeasured level; eight creations are memory evidence, not a rendering claim. |
| [portalforge-logo.png](portalforge-logo.png) | Existing project artwork, preserved unchanged. No game-evidence claim. |

Editor capture details and zero browser exceptions are recorded locally in
`browser-1789682350507/documentation-captures.json`. The capture process opened its own server and browser profile;
it neither changed the user's running editor nor started Dolphin.

SHA-256 of the published PNGs:

```text
4d5cf1d7204b012262b85bc70f23d3458618c160ba739aa87fe95f7a6e058446  editor-catalogue.png
313e8e722722d31e08f56c8a9c7d3c1b3d97dbdce6170f99316871e1f59d73c0  editor-workspace.png
9e379be49d8e40e485caa89badfe80e43731e3f2ac4692c61e5049be8f22817a  evidence-duplicated-sunflower.png
a9f5b60da0888d7cd2b3c680982f1fae390b3bd71f23d2914ea6a0636d8bf320  evidence-mining-152-additions.png
32783a788157d7d17d7486a3136e770886b7af33e7eaef5c8624d1c7b9487e7e  evidence-mining-enemy-templates.png
64cba89ca26ea1ede25cb0f70fefe3a85712352577a6029ce3c5c010aa75a785  evidence-native-additions-combat.png
f7015b02d6480fff2dfdf04b9c2febb329ceb742fc8076bf25d76d431ad702b9  evidence-native-additions-hugo.png
08082892d550d60f59f82ee474e82fbdc50e2c605e6b619b3b2a8fccbbe5580f  evidence-undead-volcano-live-table.png
fc4e7454e9104bef7fcd442d68da57509438cad482832bc2310635f2ed3ac0e1  portalforge-logo.png
```
