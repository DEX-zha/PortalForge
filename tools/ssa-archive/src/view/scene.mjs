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
// Sizes, camera placement and palette live in framing.mjs, which holds no three.js and is unit tested, so the
// headless preview command renders exactly what this scene renders rather than an approximation of it.
import {
  MARKER_RATIO, MIN_INSTANCE_SCALE, FOV, VIEW_DIR, TRIM, GROUND, GRID_MAJOR, GRID_MINOR,
  GRADE_COLOUR, MARKER_COLOUR, SELECTED_COLOUR, extentOf, proxySize, bulkBox, viewAxes, fitDistance, fitBox, gridOf,
} from './framing.mjs';

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(GROUND);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 20000);
  camera.position.set(40, 40, 40);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;

  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x1b2430, 2.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(1, 2, 1);
  scene.add(key);
  let grid = null;   // sized to the level once its extent is known

  const state = { placements: [], byOffset: new Map(), boxes: null, markers: null, entries: [], selected: null, outline: null, size: { w: 0, h: 0 }, drawn: 0, box: null, proxy: 1, grid: null };

  // Measure the wrapper, not the canvas: the canvas is absolutely positioned inside it, so its own box can be
  // reported as zero before layout settles, and a zero-sized drawing buffer renders one flat colour across the
  // whole column, which is indistinguishable from an empty scene.
  const host = canvas.parentElement ?? canvas;
  const sizeOf = () => {
    const r = host.getBoundingClientRect();
    return { w: Math.max(1, Math.floor(r.width || host.clientWidth || 1)), h: Math.max(1, Math.floor(r.height || host.clientHeight || 1)) };
  };
  let last = { w: 0, h: 0 };
  const resize = () => {
    const { w, h } = sizeOf();
    if (w === last.w && h === last.h) return;
    last = { w, h };
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    state.size = { w, h };
  };
  new ResizeObserver(resize).observe(host);
  addEventListener('resize', resize);
  resize();
  // Layout may not have settled when the module runs; keep checking until a real size shows up.
  let settle = 0;
  const untilSized = () => { resize(); if (state.size?.w > 1 && state.size?.h > 1) return; if (settle++ < 120) requestAnimationFrame(untilSized); };
  untilSized();

  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

  // Build the instanced meshes once per level. `grades` maps an offset to its worst safety severity.
  function build(placements, grades) {
    for (const m of [state.boxes, state.markers, state.outline]) if (m) { scene.remove(m); m.geometry?.dispose?.(); m.material?.dispose?.(); }
    state.placements = placements;
    state.byOffset = new Map(placements.map(p => [p.offset, p]));

    const withModel = placements.filter(p => p.model && p.model.offset !== null);
    const markers = placements.filter(p => !p.model || p.model.offset === null);

    // Extent first: it sets the proxy size, the grid and the camera, so every level reads at the same scale.
    const { lo, hi, reach } = extentOf(placements.map(p => mapping.toView(p.position)));
    const extent = new THREE.Box3(new THREE.Vector3(...lo), new THREE.Vector3(...hi));
    state.proxy = proxySize(reach);

    state.boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(state.proxy, state.proxy, state.proxy),
      new THREE.MeshLambertMaterial(), Math.max(withModel.length, 1));
    state.markers = new THREE.InstancedMesh(new THREE.OctahedronGeometry(state.proxy * MARKER_RATIO),
      new THREE.MeshBasicMaterial({ wireframe: true }), Math.max(markers.length, 1));
    for (const m of [state.boxes, state.markers]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); }

    state.entries = [];
    place(state.boxes, withModel, grades, false);
    place(state.markers, markers, grades, true);

    // A measured ground, so an object's height reads as height rather than as a position on a black field.
    if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose?.(); }
    const centre = extent.isEmpty() ? new THREE.Vector3() : extent.getCenter(new THREE.Vector3());
    const { step, span } = gridOf(reach);
    grid = new THREE.GridHelper(span, Math.max(4, Math.round(span / step)), GRID_MAJOR, GRID_MINOR);
    grid.position.set(centre.x, extent.isEmpty() ? 0 : extent.min.y - state.proxy, centre.z);
    scene.add(grid);
    state.grid = { span, step };

    const g = new THREE.BoxGeometry(state.proxy * 1.3, state.proxy * 1.3, state.proxy * 1.3);
    state.outline = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: SELECTED_COLOUR, wireframe: true }));
    state.outline.visible = false;
    scene.add(state.outline);
    state.drawn = state.entries.length;
    frameAll();
  }

  // What the scene believes it is showing. The view puts this on screen: an empty picture with 673 proxies drawn
  // is a camera or sizing problem, and an empty picture with 0 drawn is a data problem.
  function diagnostics() {
    const b = state.box;
    return { proxies: state.drawn, boxes: state.boxes?.count ?? 0, markers: state.markers?.count ?? 0,
      canvas: state.size, pixels: renderer.getContext()?.drawingBufferWidth ?? 0, proxy: Math.round(state.proxy * 10) / 10,
      bounds: b && !b.isEmpty() ? { min: b.min.toArray().map(v => Math.round(v)), max: b.max.toArray().map(v => Math.round(v)) } : null,
      camera: camera.position.toArray().map(v => Math.round(v)), target: controls.target.toArray().map(v => Math.round(v)),
      distanceText: Math.round(camera.position.distanceTo(controls.target)) + 'u out' };
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
    const s = visible ? Math.max(scaleToView(p.scale) || 1, MIN_INSTANCE_SCALE) : 0;   // never so small it disappears
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
    state.outline.scale.setScalar(Math.max(scaleToView(p.scale) || 1, MIN_INSTANCE_SCALE));
    state.outline.visible = true;
  }

  // Point the camera at a box, with framing.mjs deciding how far back. When the objects themselves are given
  // they are fitted directly: a level is a diagonal ridge inside a wide axis-aligned box whose corners hold
  // nothing, so fitting the corners pushes the camera back to make room for empty space.
  function frameBox(box, points = null) {
    if (box.isEmpty()) return;
    const centre = box.getCenter(new THREE.Vector3());
    const c = centre.toArray();
    const opts = { fov: camera.fov, aspect: camera.aspect, dir: VIEW_DIR };
    const distance = points?.length
      ? fitDistance(points.map(p => p.toArray()), c, opts)
      : fitBox(box.min.toArray(), box.max.toArray(), c, opts);
    controls.target.copy(centre);
    camera.position.copy(centre).add(new THREE.Vector3(...viewAxes(VIEW_DIR).z).multiplyScalar(distance));
    camera.near = Math.max(distance / 5000, 0.05);
    camera.far = distance * 50 + 1000;
    camera.updateProjectionMatrix();
    controls.update();
  }

  function frameAll() {
    const box = new THREE.Box3();
    const points = state.placements.map(p => new THREE.Vector3(...mapping.toView(p.position)));
    for (const v of points) box.expandByPoint(v);
    state.box = box.clone();
    frameBox(bulk().expandByScalar(state.proxy * 2), points);
  }

  // The middle 92% of the objects on each axis, from framing.mjs: framing the true extremes lets a few distant
  // markers decide the zoom for the whole level, which is how 673 proxies ended up three pixels wide.
  function bulk(trim = TRIM) {
    if (!state.placements.length) return new THREE.Box3();
    const { lo, hi } = bulkBox(state.placements.map(p => mapping.toView(p.position)), trim);
    return new THREE.Box3(new THREE.Vector3(...lo), new THREE.Vector3(...hi));
  }

  function frameSelection() {
    const p = state.selected === null ? null : state.byOffset.get(state.selected);
    if (!p) return frameAll();
    const c = new THREE.Vector3(...mapping.toView(p.position));
    frameBox(new THREE.Box3().setFromCenterAndSize(c, new THREE.Vector3(1, 1, 1).multiplyScalar(state.proxy * 8)));
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

  return { build, setVisible, refresh, hitsAt, select, frameAll, frameSelection, topDown, setGizmoMode, onGizmo, diagnostics, state };
}
