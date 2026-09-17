// 3D thumbnails for the Project cards, drawn from the geometry the level really contains.
import * as THREE from 'three';

// One offscreen renderer, shared by every visible card; no game textures are invented.
export function createThumbnails(sceneView) {
  let renderer,
    failed = false,
    queue = [],
    scheduled = false;
  const cache = new Map();
  const world = new THREE.Scene();
  world.background = new THREE.Color(0x303238);
  world.add(new THREE.HemisphereLight(0xe1edff, 0x49433e, 2.7));
  const light = new THREE.DirectionalLight(0xffffff, 2.3);
  light.position.set(3, 5, 4);
  world.add(light);
  const material = new THREE.MeshStandardMaterial({
    color: 0xb7bcc5,
    roughness: 0.85,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const camera = new THREE.PerspectiveCamera(32, 160 / 108, 0.01, 100);
  function preview(offset) {
    const p = sceneView.state.byOffset.get(offset),
      model = p?.model?.offset;
    if (cache.has(model)) return cache.get(model);
    const geometry = sceneView.state.models.find(m => m.model === model)?.mesh.geometry;
    if (!geometry || failed) return null;
    try {
      if (!renderer) {
        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setSize(240, 162);
        renderer.setPixelRatio(1);
      }
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox,
        size = bounds.getSize(new THREE.Vector3()),
        center = bounds.getCenter(new THREE.Vector3());
      const radius = size.length() / 2;
      if (!Number.isFinite(radius) || radius <= 0) return null;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.setScalar(1 / radius);
      mesh.position.copy(center).multiplyScalar(-1 / radius);
      world.add(mesh);
      camera.position
        .set(1.1, 0.75, 1.35)
        .normalize()
        .multiplyScalar(1.15 / Math.sin(THREE.MathUtils.degToRad(16)));
      camera.lookAt(0, 0, 0);
      renderer.render(world, camera);
      world.remove(mesh);
      const url = renderer.domElement.toDataURL('image/png');
      cache.set(model, url);
      return url;
    } catch {
      failed = true;
      return null;
    }
  }
  const observer = new IntersectionObserver(
    items => {
      for (const item of items)
        if (item.isIntersecting) {
          observer.unobserve(item.target);
          queue.push(item.target);
        }
      schedule();
    },
    { root: document.getElementById('objects'), rootMargin: '100px' },
  );
  function schedule() {
    if (!scheduled && queue.length) {
      scheduled = true;
      requestAnimationFrame(tick);
    }
  }
  function tick() {
    scheduled = false;
    const start = performance.now();
    do {
      const slot = queue.shift();
      if (!slot?.isConnected) continue;
      const url = preview(Number(slot.dataset.thumbnail));
      if (url) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = '3D model preview';
        img.draggable = false;
        slot.replaceChildren(img);
        slot.dataset.ready = 'true';
      } else {
        slot.textContent = '◇';
        slot.title = 'Geometry unavailable';
        slot.dataset.ready = 'missing';
      }
    } while (queue.length && performance.now() - start < 8);
    schedule();
  }
  return {
    observe(root) {
      observer.disconnect();
      queue = [];
      for (const slot of root.querySelectorAll('[data-thumbnail]')) observer.observe(slot);
    },
    invalidate() {
      cache.clear();
      observer.disconnect();
      queue = [];
    },
  };
}
