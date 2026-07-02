// Smart single-texture loader: routes `.ktx2` through the singleton KTX2Loader (once a renderer is
// available) and everything else through a shared TextureLoader. Rejects when KTX2 can't be served
// so callers keep their procedural placeholder instead of crashing.
import * as THREE from "three";
import { getKTX2Loader } from "./ktx2";

const textureLoader = new THREE.TextureLoader();

export function loadTextureSmart(url: string): Promise<THREE.Texture> {
  if (url.toLowerCase().endsWith(".ktx2")) {
    const ktx2 = getKTX2Loader();
    if (!ktx2) {
      return Promise.reject(new Error("KTX2 loader not ready (no renderer / transcoder)"));
    }
    return ktx2.loadAsync(url);
  }
  return textureLoader.loadAsync(url);
}
