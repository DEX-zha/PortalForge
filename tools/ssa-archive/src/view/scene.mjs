// The 3D scene: instanced proxies, free camera, picking and framing (feature 003 T019, T020).
//
// Every placement is one instance of a shared box, so the object count is irrelevant to the frame budget: 673
// proxies are one draw call. Placements that resolve no model are drawn as a smaller wireframe octahedron in a
// second instanced mesh, which answers "is this a visible prop or a marker" without needing a legend.
//
// Proxies carry NO real geometry. The placement record holds no bounds, so any per-object size would be invented;
// a uniform cube scaled by the record's own scale value is the honest representation (research R6).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { mapping, scaleToView, scaleToGame, headingToGame } from './coords.mjs';

const PROXY_SIZE = 1.6;          // world units, uniform: the record carries no bounds
const MARKER_SIZE = 0.7;

const GRADE_COLOUR = {
  blocking: 0xe5484d,
  critical: 0xe5484d,
  high: 0xe59a3a,
  medium: 0xd6c02e,
  info: 0x7fc08a,
};
const MARKER_COLOUR = 0x6a7b93;
const SELECTED_COLOUR = 0xffffff;

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x16181d);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 20000);
  camera.position.set(40, 40, 40);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;

  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2f3a, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(1, 2, 1);
  scene.add(key);
  scene.add(new THREE.GridHelper(400, 40, 0x2c313b, 0x22262e));

  const state = { placements: [], byOffset: new Map(), boxes: null, markers: null, entries: [], selected: null, outline: null };

  const resize = () => {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

  // Build the instanced meshes once per level. `grades` maps an offset to its worst safety severity.
  function build(placements, grades) {
    for (const m of [state.boxes, state.markers, state.outline]) if (m) { scene.remove(m); m.geometry?.dispose?.(); m.material?.dispose?.(); }
    state.placements = placements;
    state.byOffset = new Map(placements.map(p => [p.offset, p]));

    const withModel = placements.filter(p => p.model && p.model.offset !== null);
    const markers = placements.filter(p => !p.model || p.model.offset === null);

    state.boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(PROXY_SIZE, PROXY_SIZE, PROXY_SIZE),
      new THREE.MeshLambertMaterial(), Math.max(withModel.length, 1));
    state.markers = new THREE.InstancedMesh(new THREE.OctahedronGeometry(MARKER_SIZE),
      new THREE.MeshBasicMaterial({ wireframe: true }), Math.max(markers.length, 1));
    for (const m of [state.boxes, state.markers]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); }

    state.entries = [];
    place(state.boxes, withModel, grades, false);
    place(state.markers, markers, grades, true);

    const g = new THREE.BoxGeometry(PROXY_SIZE * 1.25, PROXY_SIZE * 1.25, PROXY_SIZE * 1.25);
    state.outline = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: SELECTED_COLOUR, wireframe: true }));
    state.outline.visible = false;
    scene.add(state.outline);
    frameAll();
  }

  const dummy = new THREE.Object3D();
  function place(mesh, list, grades, isMarker) {
    const colour = new THREE.Color();
    list.forEach((p, i) => {
      state.entries.push({ mesh, index: i, offset: p.offset });
      setMatrix(dummy, p, true);
      mesh.setMatrixAt(i, dummy.matrix);
      colour.setHex(isMarker ? MARKER_COLOUR : (GRADE_COLOUR[grades.get(p.offset)] ?? GRADE_COLOUR.info));
      mesh.setColorAt(i, colour);
    });
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function setMatrix(obj, p, visible) {
    const [x, y, z] = mapping.toView(p.position);
    obj.position.set(x, y, z);
    obj.rotation.set(0, THREE.MathUtils.degToRad(p.rotation.heading), 0);
    const s = visible ? Math.max(scaleToView(p.scale) || 1, 0.05) : 0;
    obj.scale.setScalar(s);
    obj.updateMatrix();
  }

  // Redraw one proxy from the record the session returned, after an edit.
  function refresh(offset) {
    const p = state.byOffset.get(offset);
    const e = state.entries.find(x => x.offset === offset);
    if (!p || !e) return;
    setMatrix(dummy, p, true);
    e.mesh.setMatrixAt(e.index, dummy.matrix);
    e.mesh.instanceMatrix.needsUpdate = true;
  }

  // Layer visibility: an instance is hidden by collapsing it to zero scale, which keeps the instance indices
  // stable so picking never has to be rebuilt.
  function setVisible(offsets) {
    for (const e of state.entries) {
      const p = state.byOffset.get(e.offset);
      setMatrix(dummy, p, offsets.has(e.offset));
      e.mesh.setMatrixAt(e.index, dummy.matrix);
    }
    state.boxes.instanceMatrix.needsUpdate = true;
    state.markers.instanceMatrix.needsUpdate = true;
    if (state.selected !== null && !offsets.has(state.selected)) select(null);
  }


  // Gizmos (feature 003 T034, T035). They are attached to the outline mesh, which stands in for the selected
  // instance: an instanced mesh has no per-instance Object3D to drag.
  //
  // The rotate and scale gizmos are deliberately crippled. The frozen record carries ONE rotation angle and ONE
  // scale number, so three rotation rings or three scale axes would invite an edit the format cannot store, and
  // the loss would only show up after saving. One ring around the vertical axis, one uniform scale handle.
  const gizmo = new TransformControls(camera, canvas);
  gizmo.setSpace('world');
  scene.add(gizmo.getHelper());
  gizmo.addEventListener('dragging-changed', e => { controls.enabled = !e.value; });

  let onLive = null, onCommit = null, dragStart = null;
  gizmo.addEventListener('objectChange', () => {
    // Only the vertical handle is shown in scale mode, so the drag moves one component; force the other two to
    // follow, because the record stores a single number and a stretched proxy would promise something else.
    if (gizmo.mode === 'scale') state.outline.scale.setScalar(state.outline.scale.y);
    if (onLive) onLive(readGizmo());
  });
  gizmo.addEventListener('mouseDown', () => { dragStart = readGizmo(); });
  gizmo.addEventListener('mouseUp', () => { if (onCommit && dragStart) onCommit(readGizmo(), dragStart); dragStart = null; });

  // What the gizmo currently expresses, in GAME units, so the caller never converts.
  function readGizmo() {
    const o = state.outline;
    return {
      position: mapping.toGame([o.position.x, o.position.y, o.position.z]).map(v => Math.round(v * 1000) / 1000),
      heading: Math.round(headingToGame(THREE.MathUtils.radToDeg(o.rotation.y)) * 10) / 10,
      scale: Math.round(scaleToGame(o.scale.x) * 10) / 10,
    };
  }

  function setGizmoMode(mode) {
    if (!mode || state.selected === null) { gizmo.detach(); return; }
    gizmo.attach(state.outline);
    gizmo.setMode(mode === 'rotate' ? 'rotate' : mode === 'scale' ? 'scale' : 'translate');
    gizmo.showX = mode === 'translate';
    gizmo.showZ = mode === 'translate';
    gizmo.showY = true;                    // the only axis rotation and scale may use
  }

  const onGizmo = ({ live, commit }) => { onLive = live; onCommit = commit; };

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // Every proxy under the cursor, nearest first, as {offset, distance}. Ordering and cycling live in select.mjs.
  function hitsAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const out = [];
    for (const mesh of [state.boxes, state.markers]) {
      if (!mesh || !mesh.count) continue;
      for (const h of raycaster.intersectObject(mesh, false)) {
        const e = state.entries.find(x => x.mesh === mesh && x.index === h.instanceId);
        if (e) out.push({ offset: e.offset, distance: h.distance });
      }
    }
    return out;
  }

  function select(offset) {
    state.selected = offset;
    const p = offset === null ? null : state.byOffset.get(offset);
    if (!p) { state.outline.visible = false; gizmo.detach(); return; }
    const [x, y, z] = mapping.toView(p.position);
    state.outline.position.set(x, y, z);
    state.outline.rotation.set(0, THREE.MathUtils.degToRad(p.rotation.heading), 0);
    state.outline.scale.setScalar(Math.max(scaleToView(p.scale) || 1, 0.05));
    state.outline.visible = true;
  }

  function frameBox(box) {
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3()).length() || 10;
    const centre = box.getCenter(new THREE.Vector3());
    controls.target.copy(centre);
    camera.position.copy(centre).add(new THREE.Vector3(1, 0.8, 1).normalize().multiplyScalar(size * 0.8 + 5));
    camera.near = Math.max(size / 5000, 0.05);
    camera.far = size * 50 + 1000;
    camera.updateProjectionMatrix();
    controls.update();
  }

  function frameAll() {
    const box = new THREE.Box3();
    for (const p of state.placements) box.expandByPoint(new THREE.Vector3(...mapping.toView(p.position)));
    frameBox(box.expandByScalar(PROXY_SIZE * 2));
  }

  function frameSelection() {
    const p = state.selected === null ? null : state.byOffset.get(state.selected);
    if (!p) return frameAll();
    const c = new THREE.Vector3(...mapping.toView(p.position));
    frameBox(new THREE.Box3().setFromCenterAndSize(c, new THREE.Vector3(1, 1, 1).multiplyScalar(PROXY_SIZE * 8)));
  }

  // A top-down view, used by quickstart scenario 2 to check the layout against an in-game screenshot.
  function topDown() {
    const box = new THREE.Box3();
    for (const p of state.placements) box.expandByPoint(new THREE.Vector3(...mapping.toView(p.position)));
    if (box.isEmpty()) return;
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length() || 10;
    controls.target.copy(centre);
    camera.position.set(centre.x, centre.y + size, centre.z + 0.001);
    camera.updateProjectionMatrix();
    controls.update();
  }

  return { build, setVisible, refresh, hitsAt, select, frameAll, frameSelection, topDown, setGizmoMode, onGizmo, state };
}
