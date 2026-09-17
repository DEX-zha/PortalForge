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
import { mapping, scaleToView, scaleToGame, headingToView, headingToGame } from './coords.mjs';
// Sizes, camera placement and palette live in framing.mjs, which holds no three.js and is unit tested, so the
// headless preview command renders exactly what this scene renders rather than an approximation of it.
import {
  MARKER_RATIO,
  MIN_INSTANCE_SCALE,
  FOV,
  VIEW_DIR,
  TRIM,
  GROUND,
  GRID_MAJOR,
  GRID_MINOR,
  GRADE_COLOUR,
  MARKER_COLOUR,
  SELECTED_COLOUR,
  levelExtent,
  proxySize,
  bulkBox,
  viewAxes,
  fitDistance,
  fitBox,
  gridOf,
  largeSurfaceLimit,
} from './framing.mjs';
import { step as flyStep, speedFor } from './navigate.mjs';
import { createScenery, disposeScenery } from './scenery.mjs';
import { scriptedPose } from './scripted-pose.mjs';

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

  // The one material real meshes share: grey, lit, both faces. Colour stays with the proxies, where it encodes risk.
  const meshMaterial = new THREE.MeshLambertMaterial({ color: 0x9a978f, side: THREE.DoubleSide });
  const sceneryMaterial = new THREE.MeshLambertMaterial({ color: 0x73818a, side: THREE.DoubleSide });
  const largeMaterial = new THREE.MeshLambertMaterial({
    color: 0x57616a,
    side: THREE.DoubleSide,
    wireframe: true,
    depthWrite: false,
  });
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x1b2430, 2.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(1, 2, 1);
  scene.add(key);
  let grid = null; // sized to the level once its extent is known

  const state = {
    placements: [],
    byOffset: new Map(),
    boxes: null,
    markers: null,
    models: [],
    meshBounds: new Map(),
    entries: [],
    selected: null,
    outline: null,
    outlineBox: null,
    size: { w: 0, h: 0 },
    drawn: 0,
    meshed: 0,
    box: null,
    proxy: 1,
    reach: 100,
    grid: null,
    scenery: null,
    sceneryVisible: true,
    largeSurfacesSolid: false,
    wireframe: false,
    fly: { held: new Set(), fast: false, slow: false },
  };

  // Measure the wrapper, not the canvas: the canvas is absolutely positioned inside it, so its own box can be
  // reported as zero before layout settles, and a zero-sized drawing buffer renders one flat colour across the
  // whole column, which is indistinguishable from an empty scene.
  const host = canvas.parentElement ?? canvas;
  const sizeOf = () => {
    const r = host.getBoundingClientRect();
    return {
      w: Math.max(1, Math.floor(r.width || host.clientWidth || 1)),
      h: Math.max(1, Math.floor(r.height || host.clientHeight || 1)),
    };
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
  const untilSized = () => {
    resize();
    if (state.size?.w > 1 && state.size?.h > 1) return;
    if (settle++ < 120) requestAnimationFrame(untilSized);
  };
  untilSized();

  // Free flight (feature 004). The camera and its orbit target move together, so releasing the keys leaves
  // orbiting working from wherever the flight stopped. A model can be big enough to swallow the camera and
  // orbiting alone cannot get out of one.
  let lastFrame = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now(),
      dt = (now - lastFrame) / 1000;
    lastFrame = now;
    if (state.fly.held.size) {
      camera.updateMatrixWorld();
      const forward = camera.getWorldDirection(new THREE.Vector3());
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const d = flyStep({
        held: state.fly.held,
        dt,
        speed: speedFor(state.reach, state.fly),
        forward: forward.toArray(),
        right: right.toArray(),
        up: [0, 1, 0],
      });
      if (d[0] || d[1] || d[2]) {
        const v = new THREE.Vector3(...d);
        camera.position.add(v);
        controls.target.add(v);
      }
    }
    controls.update();
    renderer.render(scene, camera);
  });

  // Which movement keys are held, pushed in by the view. The scene keeps no key handlers of its own: the page
  // owns the keyboard, because it also owns the text fields that must never fly the camera.
  const setFly = ({ held = new Set(), fast = false, slow = false } = {}) => {
    state.fly = { held, fast, slow };
  };

  // See-through, for when the camera is inside a mesh. Markers and the selection outline are already wireframe.
  function setWireframe(on) {
    state.wireframe = !!on;
    meshMaterial.wireframe = state.wireframe;
    sceneryMaterial.wireframe = state.wireframe;
    largeMaterial.wireframe = state.wireframe || !state.largeSurfacesSolid;
    largeMaterial.depthWrite = !largeMaterial.wireframe;
    if (state.boxes) state.boxes.material.wireframe = state.wireframe;
    return state.wireframe;
  }

  // Build the instanced meshes once per level. `grades` maps an offset to its worst safety severity.
  // `meshes` maps a model offset to its decoded geometry (feature 004); placements whose model has one are drawn
  // as that geometry, grey, at their transform. The others keep the proxy: a cube for a model the decoder does
  // not reach, a hollow marker for a placement with no model. What is missing stays visible as missing.
  function build(placements, grades, meshes = new Map(), scenery = null, { preserveCamera = false } = {}) {
    clearDropPreview();
    gizmo.detach();
    if (state.outlineBox) {
      state.outlineBox.geometry.dispose();
      state.outlineBox.material.dispose();
    }
    disposeScenery(state.scenery);
    state.scenery = createScenery(scenery, sceneryMaterial, largeMaterial);
    state.scenery.visible = state.sceneryVisible;
    scene.add(state.scenery);
    for (const m of [state.boxes, state.markers, state.outline, ...state.models.map(x => x.mesh)])
      if (m) {
        scene.remove(m);
        m.geometry?.dispose?.();
        if (m.material !== meshMaterial && m.material !== largeMaterial) m.material?.dispose?.();
      }
    state.models = [];
    state.meshBounds = new Map();
    state.placements = placements;
    state.byOffset = new Map(placements.map(p => [p.offset, p]));

    const hasMesh = p => p.model && p.model.offset !== null && meshes.has(p.model.offset);
    const withMesh = placements.filter(hasMesh);
    const withModel = placements.filter(p => p.model && p.model.offset !== null && !hasMesh(p));
    const markers = placements.filter(p => !p.model || p.model.offset === null);

    // Extent first: it sets the proxy size, the grid and the camera, so every level reads at the same scale.
    // Parked objects are drawn like any other but do not take part in it (feature 006).
    const { lo, hi, reach, parked } = levelExtent(placements.map(p => mapping.toView(p.position)));
    state.parked = parked.length;
    const extent = new THREE.Box3(new THREE.Vector3(...lo), new THREE.Vector3(...hi));
    state.proxy = proxySize(reach);
    state.reach = reach;

    state.boxes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(state.proxy, state.proxy, state.proxy),
      new THREE.MeshLambertMaterial(),
      Math.max(withModel.length, 1),
    );
    state.markers = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(state.proxy * MARKER_RATIO),
      new THREE.MeshBasicMaterial({ wireframe: true }),
      Math.max(markers.length, 1),
    );
    for (const m of [state.boxes, state.markers]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      scene.add(m);
    }

    state.entries = [];
    place(state.boxes, withModel, grades, false);
    place(state.markers, markers, grades, true);

    // One instanced mesh per model, one instance per placement of it. Grey, lit, both sides: the strips carry
    // no consistent winding and there are no materials yet.
    const byModel = new Map();
    for (const p of withMesh) {
      if (!byModel.has(p.model.offset)) byModel.set(p.model.offset, []);
      byModel.get(p.model.offset).push(p);
    }
    for (const [model, list] of byModel) {
      const m = meshes.get(model);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.positions), 3));
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(m.indices), 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      const size = geometry.boundingBox.getSize(new THREE.Vector3());
      const oversized =
        Math.max(size.x, size.y, size.z) * Math.max(...list.map(p => scaleToView(p.scale) || 1)) >
        largeSurfaceLimit(reach);
      const mesh = new THREE.InstancedMesh(geometry, oversized ? largeMaterial : meshMaterial, list.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      scene.add(mesh);
      list.forEach((p, i) => {
        state.entries.push({ mesh, index: i, offset: p.offset });
        setMatrix(dummy, p, true);
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      state.models.push({ model, mesh, count: list.length });
      if (m.bounds) state.meshBounds.set(model, m.bounds);
    }
    state.meshed = withMesh.length;

    // A measured ground, so an object's height reads as height rather than as a position on a black field.
    if (grid) {
      scene.remove(grid);
      grid.geometry.dispose();
      grid.material.dispose?.();
    }
    const centre = extent.isEmpty() ? new THREE.Vector3() : extent.getCenter(new THREE.Vector3());
    const { step, span } = gridOf(reach);
    grid = new THREE.GridHelper(span, Math.max(4, Math.round(span / step)), GRID_MAJOR, GRID_MINOR);
    grid.position.set(centre.x, extent.isEmpty() ? 0 : extent.min.y - state.proxy, centre.z);
    scene.add(grid);
    state.grid = { span, step };

    // The outline is what the gizmo holds, so it carries exactly the placement's transform; the visible wire
    // box is its child, sized to the model's bounds when there is a mesh and to the proxy otherwise.
    state.outline = new THREE.Group();
    state.outlineBox = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: SELECTED_COLOUR, wireframe: true }),
    );
    state.outline.add(state.outlineBox);
    state.outline.visible = false;
    scene.add(state.outline);
    state.drawn = state.entries.length;
    setWireframe(state.wireframe); // a rebuild keeps whatever the person was looking at
    if (!preserveCamera) frameAll();
  }

  // What the scene believes it is showing. The view puts this on screen: an empty picture with 673 proxies drawn
  // is a camera or sizing problem, and an empty picture with 0 drawn is a data problem.
  function diagnostics() {
    const b = state.box;
    return {
      proxies: state.drawn,
      meshed: state.meshed,
      models: state.models.length,
      boxes: state.boxes?.count ?? 0,
      markers: state.markers?.count ?? 0,
      scenery: state.sceneryVisible ? (state.scenery?.userData.units ?? 0) : 0,
      canvas: state.size,
      pixels: renderer.getContext()?.drawingBufferWidth ?? 0,
      proxy: Math.round(state.proxy * 10) / 10,
      bounds:
        b && !b.isEmpty()
          ? { min: b.min.toArray().map(v => Math.round(v)), max: b.max.toArray().map(v => Math.round(v)) }
          : null,
      camera: camera.position.toArray().map(v => Math.round(v)),
      target: controls.target.toArray().map(v => Math.round(v)),
      distanceText: Math.round(camera.position.distanceTo(controls.target)) + 'u out',
    };
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
    obj.rotation.set(0, THREE.MathUtils.degToRad(headingToView(p.rotation.heading)), 0);
    const s = visible ? Math.max(scaleToView(p.scale) || 1, MIN_INSTANCE_SCALE) : 0; // never so small it disappears
    obj.scale.setScalar(s);
    obj.updateMatrix();
  }

  // Redraw one proxy from the record the session returned, after an edit.
  function refresh(offset) {
    const p = state.byOffset.get(offset);
    const e = state.entries.find(x => x.offset === offset);
    if (!p || !e) return;
    setMatrix(dummy, p, !state.visibleOffsets || state.visibleOffsets.has(offset));
    e.mesh.setMatrixAt(e.index, dummy.matrix);
    e.mesh.instanceMatrix.needsUpdate = true;
    e.mesh.boundingSphere = null;
    for (const child of scriptedGroup.children.filter(c => c.userData.owner === offset)) {
      applyScriptedPose(child, p);
    }
  }

  // Layer visibility: an instance is hidden by collapsing it to zero scale, which keeps the instance indices
  // stable so picking never has to be rebuilt.
  function setVisible(offsets) {
    state.visibleOffsets = offsets;
    for (const child of scriptedGroup.children) child.visible = offsets.has(child.userData.owner);
    for (const e of state.entries) {
      const p = state.byOffset.get(e.offset);
      setMatrix(dummy, p, offsets.has(e.offset));
      e.mesh.setMatrixAt(e.index, dummy.matrix);
    }
    for (const m of [state.boxes, state.markers, ...state.models.map(x => x.mesh)])
      if (m) {
        m.instanceMatrix.needsUpdate = true;
        m.boundingSphere = null;
      }
    if (state.selected !== null && !offsets.has(state.selected)) select(null);
  }

  function setSceneryVisible(visible) {
    state.sceneryVisible = !!visible;
    if (state.scenery) state.scenery.visible = state.sceneryVisible;
  }

  function setLargeSurfacesSolid(solid) {
    state.largeSurfacesSolid = !!solid;
    setWireframe(state.wireframe);
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
  gizmo.addEventListener('dragging-changed', e => {
    controls.enabled = !e.value;
  });

  let onLive = null,
    onCommit = null,
    dragStart = null;
  gizmo.addEventListener('objectChange', () => {
    // Only the vertical handle is shown in scale mode, so the drag moves one component; force the other two to
    // follow, because the record stores a single number and a stretched proxy would promise something else.
    if (gizmo.mode === 'scale') state.outline.scale.setScalar(state.outline.scale.y);
    if (onLive) onLive(readGizmo());
  });
  gizmo.addEventListener('mouseDown', () => {
    dragStart = readGizmo();
  });
  gizmo.addEventListener('mouseUp', () => {
    if (onCommit && dragStart) onCommit(readGizmo(), dragStart);
    dragStart = null;
  });

  // What the gizmo currently expresses, in GAME units, so the caller never converts.
  function readGizmo() {
    const o = state.outline;
    return {
      offset: state.selected, // the object this outline stands in for, captured with the transform
      position: mapping.toGame([o.position.x, o.position.y, o.position.z]).map(v => Math.round(v * 1000) / 1000),
      heading: Math.round(headingToGame(THREE.MathUtils.radToDeg(o.rotation.y)) * 10) / 10,
      scale: Math.round(scaleToGame(o.scale.x) * 10) / 10,
    };
  }

  function setGizmoMode(mode) {
    if (mode === 'scale' && state.placements?.find(p => p.offset === state.selected)?.native_addition) {
      gizmo.detach();
      return;
    }
    if (!mode || state.selected === null) {
      gizmo.detach();
      return;
    }
    gizmo.attach(state.outline);
    gizmo.setMode(mode === 'rotate' ? 'rotate' : mode === 'scale' ? 'scale' : 'translate');
    gizmo.showX = mode === 'translate';
    gizmo.showZ = mode === 'translate';
    gizmo.showY = true; // the only axis rotation and scale may use
  }

  const onGizmo = ({ live, commit }) => {
    onLive = live;
    onCommit = commit;
  };
  // What the gizmo is doing right now, so the pick handler can stand aside while a handle is under the pointer.
  const gizmoState = () => ({ axis: gizmo.axis ?? null, dragging: !!gizmo.dragging });

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // Visible geometry only; the explicit horizontal plane is the fallback.
  function dropPosition(clientX, clientY, height = 0) {
    const r = canvas.getBoundingClientRect();
    if (
      !r.width ||
      !r.height ||
      clientX < r.left ||
      clientX > r.right ||
      clientY < r.top ||
      clientY > r.bottom ||
      !Number.isFinite(height)
    )
      return null;
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, (-(clientY - r.top) / r.height) * 2 + 1);
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera);
    const hits = [];
    if (state.scenery?.visible)
      state.scenery.traverse(child => {
        if (child.isMesh && child.visible) hits.push(...raycaster.intersectObject(child, false));
      });
    for (const { mesh } of state.models)
      for (const hit of raycaster.intersectObject(mesh, false)) {
        const entry = state.entries.find(e => e.mesh === mesh && e.index === hit.instanceId);
        if (entry && (!state.visibleOffsets || state.visibleOffsets.has(entry.offset))) hits.push(hit);
      }
    if (scriptedGroup.visible)
      for (const child of scriptedGroup.children) {
        if (child.visible) hits.push(...raycaster.intersectObject(child, false));
      }
    hits.sort((a, b) => a.distance - b.distance);
    const point =
      hits[0]?.point ??
      raycaster.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -mapping.toView([0, height, 0])[1]),
        new THREE.Vector3(),
      );
    return point
      ? {
          position: mapping.toGame(point.toArray()).map(v => Math.round(v * 1000) / 1000),
          mode: hits.length ? 'surface' : 'plane',
        }
      : null;
  }
  let dropGhost = null,
    dropSource = null;
  function clearDropPreview() {
    if (dropGhost) {
      scene.remove(dropGhost);
      dropGhost.geometry.dispose();
      dropGhost.material.dispose();
    }
    dropGhost = null;
    dropSource = null;
  }
  function previewDrop(offset, position) {
    const p = state.byOffset.get(offset);
    if (!p) return clearDropPreview();
    if (dropSource !== offset) {
      clearDropPreview();
      const geometry =
        state.models.find(m => m.model === p.model?.offset)?.mesh.geometry.clone() ??
        new THREE.BoxGeometry(state.proxy, state.proxy, state.proxy);
      dropGhost = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: SELECTED_COLOUR,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      scene.add(dropGhost);
      dropSource = offset;
    }
    setMatrix(dropGhost, { ...p, position }, true);
  }

  // Every proxy under the cursor, nearest first, as {offset, distance}. Ordering and cycling live in select.mjs.
  function hitsAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const out = [];
    for (const mesh of [state.boxes, state.markers, ...state.models.map(x => x.mesh)]) {
      if (!mesh || !mesh.count) continue;
      for (const h of raycaster.intersectObject(mesh, false)) {
        const e = state.entries.find(x => x.mesh === mesh && x.index === h.instanceId);
        if (e) out.push({ offset: e.offset, distance: h.distance });
      }
    }
    if (scriptedGroup.visible)
      for (const child of scriptedGroup.children) {
        if (!child.visible) continue;
        for (const h of raycaster.intersectObject(child, false))
          out.push({ offset: child.userData.owner, distance: h.distance });
      }
    return out;
  }

  function select(offset) {
    if (gizmo.dragging) return;
    state.selected = offset;
    const p = offset === null ? null : state.byOffset.get(offset);
    if (!p) {
      state.outline.visible = false;
      gizmo.detach();
      return;
    }
    const [x, y, z] = mapping.toView(p.position);
    state.outline.position.set(x, y, z);
    state.outline.rotation.set(0, THREE.MathUtils.degToRad(headingToView(p.rotation.heading)), 0);
    state.outline.scale.setScalar(Math.max(scaleToView(p.scale) || 1, MIN_INSTANCE_SCALE));
    const bb = p.model && p.model.offset !== null ? state.meshBounds.get(p.model.offset) : null;
    if (bb) {
      state.outlineBox.position.set(
        (bb.min[0] + bb.max[0]) / 2,
        (bb.min[1] + bb.max[1]) / 2,
        (bb.min[2] + bb.max[2]) / 2,
      );
      state.outlineBox.scale.set(
        Math.max(bb.max[0] - bb.min[0], 0.05),
        Math.max(bb.max[1] - bb.min[1], 0.05),
        Math.max(bb.max[2] - bb.min[2], 0.05),
      );
    } else {
      state.outlineBox.position.set(0, 0, 0);
      state.outlineBox.scale.setScalar(state.proxy * 1.3);
    }
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
      ? fitDistance(
          points.map(p => p.toArray()),
          c,
          opts,
        )
      : fitBox(box.min.toArray(), box.max.toArray(), c, opts);
    controls.target.copy(centre);
    camera.position.copy(centre).add(new THREE.Vector3(...viewAxes(VIEW_DIR).z).multiplyScalar(distance));
    camera.near = Math.max(distance / 5000, 0.05);
    camera.far = distance * 50 + 1000;
    camera.updateProjectionMatrix();
    controls.update();
  }

  function frameAll() {
    // Frame the playable placements, not the enclosing sky/backdrop geometry now present in scenery.
    // Otherwise a distant world surface would push the camera away from the actual editing area.
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
    const { lo, hi } = bulkBox(
      state.placements.map(p => mapping.toView(p.position)),
      trim,
    );
    return new THREE.Box3(new THREE.Vector3(...lo), new THREE.Vector3(...hi));
  }

  function frameSelection() {
    const p = state.selected === null ? null : state.byOffset.get(state.selected);
    if (!p) return frameAll();
    const generated = scriptedGroup.children.filter(c => c.userData.owner === p.offset && c.visible);
    if (generated.length && scriptedGroup.visible) {
      const box = new THREE.Box3();
      generated.forEach(c => box.expandByObject(c));
      frameBox(box.expandByScalar(state.proxy * 2));
      return;
    }
    const c = new THREE.Vector3(...mapping.toView(p.position));
    const bb = p.model && p.model.offset !== null ? state.meshBounds.get(p.model.offset) : null;
    const span = bb
      ? Math.max(...[0, 1, 2].map(k => bb.max[k] - bb.min[k])) *
        Math.max(scaleToView(p.scale) || 1, MIN_INSTANCE_SCALE) *
        3
      : state.proxy * 8;
    frameBox(new THREE.Box3().setFromCenterAndSize(c, new THREE.Vector3(1, 1, 1).multiplyScalar(span)));
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

  const scriptedGroup = new THREE.Group();
  scene.add(scriptedGroup);
  function applyScriptedPose(mesh, owner) {
    const pose = scriptedPose(mesh.userData.preview, owner);
    mesh.position.set(...mapping.toView(pose.position));
    mesh.rotation.y = THREE.MathUtils.degToRad(headingToView(pose.heading));
    mesh.scale.setScalar(scaleToView(pose.scale));
  }
  function setScriptedPreviews(previews, meshes) {
    for (const child of [...scriptedGroup.children]) {
      scriptedGroup.remove(child);
      child.geometry.dispose();
      child.material.dispose();
    }
    for (const p of previews) {
      const data = meshes.get(p.model);
      if (!data) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.positions), 3));
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(data.indices), 1));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: 0x8d9ba3, side: THREE.DoubleSide }));
      mesh.userData.owner = p.owner;
      mesh.userData.preview = p;
      applyScriptedPose(mesh, state.byOffset.get(p.owner));
      scriptedGroup.add(mesh);
    }
  }
  function setScriptedVisible(visible) {
    scriptedGroup.visible = visible;
  }
  return {
    build,
    setVisible,
    setSceneryVisible,
    setScriptedPreviews,
    setScriptedVisible,
    setLargeSurfacesSolid,
    refresh,
    hitsAt,
    dropPosition,
    previewDrop,
    clearDropPreview,
    select,
    frameAll,
    frameSelection,
    topDown,
    setGizmoMode,
    onGizmo,
    gizmoState,
    setFly,
    setWireframe,
    diagnostics,
    state,
  };
}
