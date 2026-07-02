// Memoizes materials by (channel, resolved-hex) so N peds share ≤ K materials. The spec's core
// perf lever: a crowd of 30 in one district collapses to a handful of MeshStandardMaterials.

import * as THREE from "three";
import type { Palette, PaletteChannel } from "../types";
import { materialKey, resolveColor } from "./palette";

// Per-channel surface response so a body doesn't read as one uniform plastic: skin is soft and
// slightly glossy, fabric is matte, leather (shoes) has a low sheen, hair catches a highlight.
const SURFACE: Readonly<Record<PaletteChannel, { roughness: number; metalness: number }>> = {
  skin: { roughness: 0.58, metalness: 0.0 },
  hair: { roughness: 0.62, metalness: 0.08 },
  clothing: { roughness: 0.86, metalness: 0.02 },
  clothingDark: { roughness: 0.84, metalness: 0.02 },
  shoe: { roughness: 0.42, metalness: 0.12 },
  accent: { roughness: 0.7, metalness: 0.05 },
};

export class MaterialCache {
  private readonly cache = new Map<string, THREE.MeshStandardMaterial>();

  get(channel: PaletteChannel, palette: Palette): THREE.MeshStandardMaterial {
    const key = materialKey(channel, palette);
    let mat = this.cache.get(key);
    if (!mat) {
      const surface = SURFACE[channel] ?? SURFACE.clothing;
      mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(resolveColor(channel, palette)),
        roughness: surface.roughness,
        metalness: surface.metalness,
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
