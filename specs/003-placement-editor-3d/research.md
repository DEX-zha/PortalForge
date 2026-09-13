# Phase 0 research: 3D placement editor

Seven questions had to be settled before the design could be written. Each is recorded as a decision, the reason
for it, and what was rejected. Two of them are not yet answered by evidence and carry an explicit verification
step rather than a confident answer.

---

## R1. Where does the editor run

**Decision**: a Node process that owns the file, serving a browser view on `127.0.0.1`. The view is plain ES
modules with no build step; the process serves them and `three` straight from disk.

**Rationale**: the constitution fixes Node 24 with ES modules for the toolkit and allows a language migration only
after the formats involved are CONFIRMED. A browser view needs no migration, since the format code stays in Node
and the browser only receives resolved records as JSON. It also keeps one language and one module system across
both surfaces, so a function can move between them without translation.

**Alternatives considered**: a desktop shell such as Electron, rejected because it adds a large dependency and a
packaging step for a single-user local tool; a terminal interface, rejected because the feature is a 3D view; a
native application in another language, rejected by the constitution's migration rule and by the cost of
re-implementing the format code.

---

## R2. Which rendering library

**Decision**: `three` as the only new runtime dependency, served from `node_modules` by the editor process.

**Rationale**: the feature needs a perspective camera with free orbit, ray picking against many objects, and three
distinct transform gizmos. `three` provides all of it, including `TransformControls`, which is the exact shape of
FR-012. Writing this by hand is several thousand lines dominated by gizmo mathematics, which is not the research
this project is doing.

**Alternatives considered**: raw WebGL, rejected for the reason above; a CDN copy of `three`, rejected because the
tool must work offline and a runtime download is an unpinned dependency; a 2D top-down canvas, rejected because it
cannot express height, and the levels are floating islands where height is most of the geometry.

---

## R3. Drawing seven hundred selectable boxes

**Decision**: a single instanced mesh holding every placement of the level, with a per-instance colour, plus a
visible-index list rebuilt whenever layer visibility changes. Picking uses a ray cast against that instanced mesh,
which returns an instance index.

**Rationale**: it makes the object count irrelevant to the frame budget, which is what SC-001 asks for, and it
keeps a single object to raycast against. Rebuilding the index list for 673 objects costs microseconds, so layer
toggling needs no special machinery.

**Alternatives considered**: one mesh per placement, rejected because it turns a trivial scene into hundreds of
draw calls and a large object graph for no benefit; one instanced mesh per layer, rejected because placements
belong to several layers at once, so the split is not a partition.

---

## R4. Reaching an object hidden behind another

**Decision**: a click collects every hit along the ray, sorted by distance, and selects the first. Clicking again
without moving the pointer advances to the next hit and wraps around. The inspector always names what is selected,
and the selected proxy is outlined.

**Rationale**: FR-004 requires reaching an overlapped object, and levels do contain coincident placements, for
instance several markers sharing one spot. Cycling is the cheapest interaction that guarantees reachability
without a separate outliner interaction, and it is a pure function of the hit list, so it is unit testable
without a browser.

**Alternatives considered**: a transparency or x-ray mode, rejected as more work for less certainty; selecting
through a list only, rejected because the feature is about pointing at things in space.

---

## R5. Gizmos for a record that has one rotation angle and one scale number

**Decision**: the move gizmo exposes three axes. The rotate gizmo exposes one ring, around the vertical axis, and
writes the heading field. The scale gizmo is uniform and writes the single scale number, displayed as a percentage
because the file stores 100 for unit scale.

**Rationale**: the frozen placement record carries one rotation angle and one scale value. Offering three rotation
rings or three scale axes would invite an edit the format cannot store, and the researcher would discover the loss
only after saving. Constraining the gizmo to what the record holds keeps the interface honest about the format.

**Alternatives considered**: full three-axis gizmos with silent projection onto the stored fields, rejected because
it hides a lossy operation behind a familiar control; a numeric-only inspector, rejected because dragging in space
is the point of the feature.

---

## R6. How large a proxy should be, and how markers are distinguished

**Decision**: a uniform cube of a fixed world size for every placement that resolves a model, scaled by the
placement's own scale value, and a smaller wireframe octahedron for a placement that resolves none. Colour is
derived from the safety grading: neutral for a static object, marked for a scripted one, distinct again for an
object whose model is shared with many others.

**Rationale**: the placement record carries no bounds, so any per-object size would be invented. A uniform size is
the honest representation, and the shape difference answers FR-003 without needing a legend. Deriving colour from
the safety grading means the risk the researcher must respect is visible before they select anything.

**Alternatives considered**: reading real bounds from the model files, rejected because geometry is out of scope
for this feature and the bounds are not resolved; sizing by the physics extent seen at a fixed offset in some
placements, rejected because that field is not part of the frozen record and its meaning is not established.

---

## R7. Mapping game coordinates to the view

**Decision**: adopt the direct mapping, game x, y, z to view x, y, z with y upward, and treat the handedness as
**unverified**. The quickstart includes a verification step: display the tutorial from above, compare the layout
with a screenshot of the same island in game, and confirm that the windmill, the bridge and the two sunflowers
fall on the same side of the spawn. If they mirror, negate one horizontal axis in a single documented place.

**Rationale**: the evidence available today fixes the vertical axis and the scale, because the spawn point and the
prop positions are known and consistent, but it does not fix the handedness. A screenshot taken during the
duplication runs suggests that one horizontal axis is inverted relative to the obvious reading, and a suggestion
from one camera angle is not proof. The project's own first principle is that a capability exists only when
runtime evidence shows it, so the mapping ships with a verification step rather than a confident claim.

**Alternatives considered**: deriving handedness from the heading convention, rejected because the rotation origin
is itself unverified; ignoring the question, rejected because a mirrored view would make every spatial judgement
in the tool wrong while looking entirely plausible.

---

## R8. Talking to the editor process

**Decision**: JSON over HTTP on `node:http`, with no framework, and a small set of endpoints published as a
contract. The view holds no file knowledge: it asks for a level, receives placements, and sends intents.

**Rationale**: the toolkit's only network dependency today is the emulator bridge, and adding a server framework
for a handful of local routes would be the largest new dependency in the repository for the least benefit. A
published contract also gives the command line a second way in, so a scripted run can drive the same session.

**Alternatives considered**: a WebSocket channel, rejected because nothing here is push-driven and it complicates
the contract; writing the view state to disk and polling, rejected as slower and harder to reason about; embedding
the view in the CLI process without a server, rejected because a browser cannot read a local module tree without
one.

---

## Unresolved after Phase 0

- **The handedness of the horizontal plane** (R7). Verification is in the quickstart and must be done on the first
  run against the tutorial; until it passes, no spatial claim the editor makes should be trusted.
- **Whether a second level edits correctly in game** is not a research question but the subject of User Story 4;
  it is the acceptance criterion that turns this from a tutorial-specific tool into an editor.
