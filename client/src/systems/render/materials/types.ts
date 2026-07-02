// Shared TypeScript types for the render/materials subsystem.
// Kept dependency-light (only `three` types) so every module can import from here without cycles.
import type * as THREE from "three";

/** Runtime quality tier — mirrors the v0 render tier names but is owned locally so this
 *  subsystem stays self-contained (integrator wires the app's tier into `setQualityTier`). */
export type QualityTier = "low" | "medium" | "high";

/** Which master program a def compiles into. Keeping this small caps distinct shader programs. */
export type MasterKind =
  | "env" // buildings/roads/props — MeshStandardMaterial + wetness + optional night emissive
  | "emissive" // neon signage — night-ramped emissive (>1 luminance blooms)
  | "glass" // windows — MeshPhysicalMaterial transmission (opaque fresnel fallback on Low)
  | "vehicle" // car paint — MeshPhysicalMaterial clearcoat + wetness
  | "foliage"; // plants/cloth — alphaTest + DoubleSide + wind vertex sway

/**
 * A CC0 PBR texture set + tuning. Real `.ktx2`/`.png` paths are optional; when they're absent
 * (v0) — or when the loader can't reach them — a calibrated procedural fallback keeps the
 * material fully renderable so nothing ever breaks waiting on assets.
 */
export interface MaterialDef {
  id: string;
  master: MasterKind;
  /** Albedo tint + procedural-fallback base color (hex). */
  color?: string;
  roughness?: number; // 0..1
  metalness?: number; // 0..1
  emissive?: string; // hex; presence enables the emissive response
  emissiveIntensity?: number; // >1 → blooms (see EMISSIVE_BLOOM_THRESHOLD)
  repeat?: [number, number]; // UV tiling
  /** 0..1 — how strongly this surface soaks/darkens when wet (asphalt high, glass ~0). */
  porosity?: number;
  /** 0..1 — how readily puddles pool on this surface (flat asphalt high, walls ~0). */
  puddleFactor?: number;
  /** transmission for the glass master (0..1). */
  transmission?: number;
  ior?: number;
  /** clearcoat for the vehicle master (0..1). */
  clearcoat?: number;
  alphaTest?: number; // foliage cutout threshold
  /** CC0 asset URLs (compressed `.ktx2` preferred). Omitted in v0 → procedural fallback. */
  maps?: {
    albedo?: string; // _diff / Color   (SRGB)
    normal?: string; // _nor_gl / NormalGL (linear)
    arm?: string; // packed AO(R)/Rough(G)/Metal(B) (linear)
    emissive?: string; // (SRGB)
  };
}

/** Configured, ready-to-use maps handed to a master factory. */
export interface PbrMaps {
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  aoMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  metalnessMap?: THREE.Texture;
  emissiveMap?: THREE.Texture;
}

/**
 * Per-instance knobs. Supplying overrides produces a distinct cached material VARIANT that still
 * shares ONE GPU program (via a stable `customProgramCacheKey`), so program/PSO count stays bounded.
 */
export interface MaterialOverrides {
  puddleFactor?: number;
  porosity?: number;
  emissiveBoost?: number;
  color?: string;
}

/** Options a master factory accepts (resolved from a def + overrides by the registry). */
export interface MasterOptions {
  color?: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  emissiveBoost?: number;
  puddleFactor?: number;
  porosity?: number;
  transmission?: number;
  ior?: number;
  clearcoat?: number;
  alphaTest?: number;
}
