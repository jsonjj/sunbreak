// Public API for the render/materials subsystem — the ONE module other subsystems import from.
// (Import via the folder root: `@/systems/render/materials`.)
//
// Contract for mesh authors (env, vehicles, foliage, characters, water):
//   • Reference shared materials by def id — `MaterialRegistry.get("asphalt")` — never `new` a raw
//     material (keeps program count + VRAM bounded). Or tag an ECS entity: `entity.mat_defId = "asphalt"`.
//   • Read/drive weather via the uniform bus setters (`setTimeOfDay`, `setWeather`, `setWetness`).
//   • Emissive luminance > EMISSIVE_BLOOM_THRESHOLD (1.0) is the shared "this should bloom" convention.

// ── Material library ──────────────────────────────────────────────────────────
export { MaterialRegistry } from "./MaterialRegistry";
export { materialDefs, resolveDef, DEFAULT_DEF_ID } from "./pbr/materialDefs";
export type { MaterialDefId } from "./pbr/materialDefs";

// Master factories (advanced/custom use — the registry is the normal path).
export { makeEnvStandard } from "./masters/envStandard";
export { makeEmissiveNeon } from "./masters/emissiveNeon";
export { makeGlassPhysical } from "./masters/glassPhysical";
export { makeVehiclePhysical } from "./masters/vehiclePhysical";
export { makeFoliageStandard } from "./masters/foliageStandard";
export { injectMaterial } from "./masters/inject";

// ── Uniform bus (wetness / night / sun / wind) ──────────────────────────────────
export { globalUniforms } from "./globalUniforms";
export type { GlobalUniforms } from "./globalUniforms";
export {
  useEnvStore,
  updateUniformBus,
  setTimeOfDay,
  setRain,
  setWind,
  setWetness,
  setWeather,
} from "./uniformBus";
export type { EnvStore, WeatherInput } from "./uniformBus";

// ── GLSL chunks (shared with Water for shoreline/puddle continuity) ─────────────
export { matWetnessFns, matWetnessAlbedo, matWetnessRoughness } from "./chunks/wetness.glsl";
export { matNightEmissive } from "./chunks/emissive.glsl";
export { matWindFns, matWindApply } from "./chunks/wind.glsl";

// ── Quality tiers + texture budget ──────────────────────────────────────────────
export { setQualityTier, getQualityTier, getTierCaps, onQualityTierChange, TEXTURE_TIERS } from "./quality";
export { estimateTextureVRAM, getTextureBudget } from "./budgets/textureBudget";
export type { TierCaps } from "./budgets/textureBudget";

// ── Texture pipeline (KTX2) ─────────────────────────────────────────────────────
export { setMaterialsRenderer, configureKtx2Transcoder, isKtx2Ready, disposeKtx2 } from "./textures/ktx2";
export { loadPbrSet } from "./pbr/index";

// ── ECS helper + optional runtime component ─────────────────────────────────────
export { applyMaterialToObject } from "./system";
export { MaterialsRuntime } from "./runtime";

// ── Shared types + conventions ──────────────────────────────────────────────────
export type { MaterialDef, MaterialOverrides, MasterKind, PbrMaps, MasterOptions, QualityTier } from "./types";

/** Emissive luminance above this blooms (shared convention with the Post-processing subsystem). */
export const EMISSIVE_BLOOM_THRESHOLD = 1.0;

/** This subsystem's registry id. */
export const MATERIALS_MODULE_ID = "render/materials";
