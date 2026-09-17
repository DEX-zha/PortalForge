// World scenery has no placement transform and never enters the placement picking/gizmo lists.
import * as THREE from 'three';
import { mapping } from './coords.mjs';

export function createScenery(scenery, material, largeMaterial = material) {
  const group = new THREE.Group();
  group.name = 'scenery';
  group.userData = { editable: false, units: scenery?.units ?? 0 };
  for (const chunk of scenery?.chunks ?? []) {
    const positions = new Float32Array(chunk.positions.length);
    for (let i = 0; i < positions.length; i += 3) positions.set(mapping.toView(chunk.positions.subarray(i, i + 3)), i);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(chunk.indices), 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, chunk.large_surface ? largeMaterial : material);
    mesh.userData = { editable: false, descriptors: chunk.descriptors };
    group.add(mesh);
  }
  return group;
}

export function disposeScenery(group) {
  group?.removeFromParent();
  group?.traverse(m => m.geometry?.dispose());
}
