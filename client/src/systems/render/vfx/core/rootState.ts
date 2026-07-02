// Bridges the ECS `(world, dt)` render-phase system into the live R3F render root WITHOUT
// mounting a React component or editing v0 (App/Scene/RenderCanvas are off-limits).
//
// `SystemsRunner` drives our system from inside the <Canvas> frame loop, but only hands us
// `(world, dt)` — no scene/camera. R3F, however, keeps every live root in the exported
// `_roots` map. There is exactly one <Canvas> in SUNBREAK, so we read its store to recover
// `{ scene, camera, gl }`. This is a read-only use of a public R3F export — no hand-mounting.
import * as THREE from "three";
import { _roots } from "@react-three/fiber";

export interface CapturedRoot {
  scene: THREE.Scene;
  camera: THREE.Camera;
  gl: THREE.WebGLRenderer;
}

/** Returns the active R3F root's `{ scene, camera, gl }`, or null until the canvas is live. */
export function captureRoot(): CapturedRoot | null {
  for (const root of _roots.values()) {
    const state = root.store.getState();
    if (state && state.scene && state.camera && state.gl) {
      return { scene: state.scene, camera: state.camera, gl: state.gl };
    }
  }
  return null;
}
