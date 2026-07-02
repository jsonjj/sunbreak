// Singleton KTX2Loader. The classic footgun is constructing a loader per-load (worker leak →
// Chrome OOM crash), so this module owns exactly ONE instance for the whole app.
//
// Import note: `three-stdlib` is not reachable under this repo's pnpm linking, so we import
// `KTX2Loader` straight from the `three` package (a direct dep) which also ships the basis
// transcoder. `detectSupport(renderer)` MUST run once before loading — call `setMaterialsRenderer`
// (or mount <MaterialsRuntime/>). Until then, `.ktx2` loads fall back gracefully to placeholders.
import type * as THREE from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

// Where the basis transcoder (basis_transcoder.js + .wasm) is served from. The integrator vendors
// three/examples/jsm/libs/basis/* into client/public/basis/ (a central change, outside this folder).
let transcoderPath = "/basis/";

let loader: KTX2Loader | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let supported = false;

export function configureKtx2Transcoder(path: string): void {
  transcoderPath = path.endsWith("/") ? path : `${path}/`;
  if (loader) loader.setTranscoderPath(transcoderPath);
}

/** Provide the WebGLRenderer once (from useThree). Enables KTX2 by running detectSupport. */
export function setMaterialsRenderer(gl: THREE.WebGLRenderer): void {
  renderer = gl;
  if (loader) {
    loader.detectSupport(gl);
    supported = true;
  }
}

/** True once a renderer has been supplied and hardware support has been probed. */
export function isKtx2Ready(): boolean {
  return supported;
}

/** Lazily build the singleton. Returns null until a renderer is available (so callers fall back). */
export function getKTX2Loader(): KTX2Loader | null {
  if (!renderer) return null;
  if (!loader) {
    loader = new KTX2Loader().setTranscoderPath(transcoderPath);
    loader.detectSupport(renderer);
    supported = true;
  }
  return loader;
}

/** Tear down the singleton + its worker pool (call on subsystem cleanup). */
export function disposeKtx2(): void {
  loader?.dispose();
  loader = null;
  renderer = null;
  supported = false;
}
