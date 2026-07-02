// Memoizes materials by (channel, resolved-hex) so N peds share ≤ K materials. The spec's core
// perf lever: a crowd of 30 in one district collapses to a handful of MeshStandardMaterials.

import * as THREE from "three";
import type { Palette, PaletteChannel } from "../types";
import { materialKey, resolveColor } from "./palette";

export class MaterialCache {
  private readonly cache = new Map<string, THREE.MeshStandardMaterial>();

  get(channel: PaletteChannel, palette: Palette): THREE.MeshStandardMaterial {
    const key = materialKey(channel, palette);
    let mat = this.cache.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(resolveColor(channel, palette)),
        roughness: channel === "skin" ? 0.72 : 0.9,
        metalness: 0.02,
      });
      mat.name = key;
      this.cache.set(key, mat);
    }
    return mat;
  }

  get size(): number {
    return this.cache.size;
  }

  dispose(): void {
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
  }
}

/** Process-wide shared cache (all characters pull from this so materials are truly shared). */
export const sharedMaterialCache = new MaterialCache();
