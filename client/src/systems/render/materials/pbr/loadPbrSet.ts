// Turns a MaterialDef into configured PBR maps. Two phases:
//   1) buildPlaceholderMaps — SYNCHRONOUS calibrated procedural maps so the material renders
//      immediately and its shader `#define`s (USE_MAP, USE_NORMALMAP…) are stable from the start.
//   2) upgradeToRealMaps    — best-effort ASYNC swap to real CC0 `.ktx2` assets into the SAME
//      material slots (no recompile), disposing the placeholders. Silent no-op if assets/KTX2 aren't
//      available — nothing ever breaks waiting on textures.
import * as THREE from "three";
import type { MaterialDef, PbrMaps } from "../types";
import { makeProceduralPbr } from "../textures/procedural";
import { loadTextureSmart } from "../textures/loaders";
import { getTierCaps } from "../quality";
import { trackTexture, untrackTexture } from "../budgets/textureBudget";

function configure(tex: THREE.Texture, opts: { srgb: boolean; repeat: [number, number]; anisotropy: number }): void {
  tex.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  tex.anisotropy = opts.anisotropy;
  tex.needsUpdate = true;
}

/** Phase 1 — synchronous placeholders (always succeeds). */
export function buildPlaceholderMaps(def: MaterialDef): PbrMaps {
  const caps = getTierCaps();
  const repeat = def.repeat ?? [1, 1];
  const proc = makeProceduralPbr(def);

  configure(proc.albedo, { srgb: true, repeat, anisotropy: caps.anisotropy });
  configure(proc.normal, { srgb: false, repeat, anisotropy: caps.anisotropy });
  configure(proc.arm, { srgb: false, repeat, anisotropy: caps.anisotropy });

  const maps: PbrMaps = {
    map: proc.albedo,
    normalMap: proc.normal,
    // ARM packing: one texture drives AO(R)/Rough(G)/Metal(B).
    aoMap: proc.arm,
    roughnessMap: proc.arm,
    metalnessMap: proc.arm,
  };
  if (proc.emissive) {
    configure(proc.emissive, { srgb: true, repeat, anisotropy: caps.anisotropy });
    maps.emissiveMap = proc.emissive;
  }

  trackTexture(proc.albedo);
  trackTexture(proc.normal);
  trackTexture(proc.arm);
  if (proc.emissive) trackTexture(proc.emissive);
  return maps;
}

// MeshPhysicalMaterial extends MeshStandardMaterial, so this narrows both.
function asStandard(m: THREE.Material): THREE.MeshStandardMaterial | null {
  return (m as THREE.MeshStandardMaterial).isMeshStandardMaterial ? (m as THREE.MeshStandardMaterial) : null;
}

function swap(
  material: THREE.MeshStandardMaterial,
  slot: "map" | "normalMap" | "emissiveMap",
  tex: THREE.Texture,
  repeat: [number, number],
  anisotropy: number,
  srgb: boolean,
): void {
  const old = material[slot];
  configure(tex, { srgb, repeat, anisotropy });
  material[slot] = tex;
  if (old) {
    untrackTexture(old);
    old.dispose();
  }
  trackTexture(tex);
  // Slot was already non-null (placeholder) → texture upload only, no program recompile.
}

/** Phase 2 — async best-effort upgrade to real CC0 assets. */
export function upgradeToRealMaps(material: THREE.Material, def: MaterialDef): void {
  const std = asStandard(material);
  if (!def.maps || !std) return;
  const caps = getTierCaps();
  const repeat = def.repeat ?? [1, 1];
  const aniso = caps.anisotropy;

  const load = (url: string | undefined, apply: (t: THREE.Texture) => void) => {
    if (!url) return;
    loadTextureSmart(url)
      .then(apply)
      .catch(() => {
        /* keep procedural placeholder */
      });
  };

  load(def.maps.albedo, (t) => swap(std, "map", t, repeat, aniso, true));
  load(def.maps.normal, (t) => swap(std, "normalMap", t, repeat, aniso, false));
  load(def.maps.emissive, (t) => swap(std, "emissiveMap", t, repeat, aniso, true));
  load(def.maps.arm, (t) => {
    // One ARM texture feeds all three channels; dispose the shared placeholder once.
    const old = std.aoMap;
    configure(t, { srgb: false, repeat, anisotropy: aniso });
    std.aoMap = t;
    std.roughnessMap = t;
    std.metalnessMap = t;
    if (std.aoMap) std.aoMap.channel = 0;
    if (old) {
      untrackTexture(old);
      old.dispose();
    }
    trackTexture(t);
  });
}
