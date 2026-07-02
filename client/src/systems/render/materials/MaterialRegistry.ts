// The shared material library. Dedupes by def id (+ optional instance overrides) so N meshes
// reference ONE material / one GPU program. This is the single object mesh-authoring subsystems
// (env, vehicles, foliage, characters) call — they never author raw materials themselves.
import type * as THREE from "three";
import type { MaterialOverrides } from "./types";
import { resolveDef } from "./pbr/materialDefs";
import { buildPlaceholderMaps, upgradeToRealMaps } from "./pbr/loadPbrSet";
import { makeEnvStandard } from "./masters/envStandard";
import { makeEmissiveNeon } from "./masters/emissiveNeon";
import { makeGlassPhysical } from "./masters/glassPhysical";
import { makeVehiclePhysical } from "./masters/vehiclePhysical";
import { makeFoliageStandard } from "./masters/foliageStandard";
import { getQualityTier } from "./quality";

const cache = new Map<string, THREE.Material>();

function variantKey(id: string, o?: MaterialOverrides): string {
  if (!o) return id;
  return `${id}#p=${o.puddleFactor ?? ""}|po=${o.porosity ?? ""}|e=${o.emissiveBoost ?? ""}|c=${o.color ?? ""}`;
}

function build(id: string, o?: MaterialOverrides): THREE.Material {
  const def = resolveDef(id);
  const maps = buildPlaceholderMaps(def);
  const opts = {
    color: o?.color ?? def.color,
    roughness: def.roughness,
    metalness: def.metalness,
    emissive: def.emissive,
    emissiveIntensity: def.emissiveIntensity,
    emissiveBoost: o?.emissiveBoost,
    puddleFactor: o?.puddleFactor ?? def.puddleFactor,
    porosity: o?.porosity ?? def.porosity,
    transmission: def.transmission,
    ior: def.ior,
    clearcoat: def.clearcoat,
    alphaTest: def.alphaTest,
  };

  let material: THREE.Material;
  switch (def.master) {
    case "emissive":
      material = makeEmissiveNeon(maps, opts);
      break;
    case "glass":
      material = makeGlassPhysical(opts, getQualityTier());
      break;
    case "vehicle":
      material = makeVehiclePhysical(opts);
      break;
    case "foliage":
      material = makeFoliageStandard(maps, opts);
      break;
    case "env":
    default:
      material = makeEnvStandard(maps, opts);
      break;
  }
  material.name = def.id;
  upgradeToRealMaps(material, def);
  return material;
}

export const MaterialRegistry = {
  /** Get (build-once, cache) a shared material for a def id. Overrides yield a cached variant. */
  get(id: string, overrides?: MaterialOverrides): THREE.Material {
    const key = variantKey(id, overrides);
    let m = cache.get(key);
    if (!m) {
      m = build(id, overrides);
      cache.set(key, m);
    }
    return m;
  },

  has(id: string, overrides?: MaterialOverrides): boolean {
    return cache.has(variantKey(id, overrides));
  },

  /** Warm materials at load to avoid first-use PSO compile hitches. */
  preload(ids: string[]): void {
    for (const id of ids) this.get(id);
  },

  /** Distinct cached materials (variants included). Instancing keeps GPU program count far lower. */
  size(): number {
    return cache.size;
  },

  list(): string[] {
    return [...cache.keys()];
  },

  disposeAll(): void {
    for (const m of cache.values()) m.dispose();
    cache.clear();
  },
};
