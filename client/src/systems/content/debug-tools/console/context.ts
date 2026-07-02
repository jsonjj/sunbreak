// Live THREE handles, populated from inside the <Canvas> by the debug canvas layer and read by
// DOM-side tools (e.g. a screenshot command). Kept as a mutable module singleton so console
// commands can reach `gl/scene/camera` without threading refs through React.

import type * as THREE from "three";

export interface ThreeRefs {
  gl: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
}

export const threeRefs: ThreeRefs = { gl: null, scene: null, camera: null };

export function setThreeRefs(refs: Partial<ThreeRefs>): void {
  Object.assign(threeRefs, refs);
}
