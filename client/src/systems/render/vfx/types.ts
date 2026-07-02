// Public data contracts for the VFX subsystem. Pure types + tiny helpers (no runtime deps),
// so combat / vehicles / weather can build events without importing the whole engine.
import type { Vec3, Vec3Tuple } from "@sunbreak/shared";

/** Anything shaped like a 3D point — a shared `Vec3` POJO OR a live `THREE.Vector3`
 *  (which is structurally `{ x, y, z }`). Lets callers pass either without conversion. */
export type Vec3Like = Vec3;

/** Surfaces drive the impact matrix (spark vs. splash vs. puff vs. blood, etc.). */
export type VfxSurface =
  | "concrete"
  | "metal"
  | "wood"
  | "glass"
  | "water"
  | "flesh"
  | "sand"
  | "dirt"
  | "foliage";

/** Every transient effect family the manager can spawn. */
export type VfxEventType =
  | "muzzle"
  | "impact"
  | "explosion"
  | "smoke"
  | "dust"
  | "spark"
  | "skid"
  | "blood"
  | "lightning"
  | "rain";

/** Fire-and-forget VFX request. The only shape callers ever need to build. */
export interface VfxEvent {
  type: VfxEventType;
  /** World position. Accepts a `Vec3` POJO or a `THREE.Vector3`. */
  position: Vec3Like;
  /** Surface normal (impacts / decals orient to this). */
  normal?: Vec3Like;
  /** Direction of travel (muzzle cone, spark spray, tracer). */
  dir?: Vec3Like;
  /** Material the effect hit (impact matrix lookup). */
  surface?: VfxSurface;
  /** Uniform scale multiplier (default 1). */
  scale?: number;
  /** Optional hex tint override (0xRRGGBB) — otherwise the registry preset decides. */
  color?: number;
  /** 0..1+ strength; scales counts / light / bloom for explosions & muzzle. */
  intensity?: number;
  /** Deterministic seed (v4 netcode: identical FX on every client). */
  seed?: number;
  /** Hard override for emitted particle count (before budget clamping). */
  count?: number;
}

/** Internal quality tiers (mapped from the global quality store's low/medium/high). */
export type VfxTier = "LOW" | "MED" | "HIGH";

/** Weather is a PULL source: the manager reads this each frame to drive rain + wetness. */
export interface WeatherState {
  /** Rain intensity 0..1 (0 = clear). */
  rain: number;
  /** Wind vector (m/s) — advects rain, smoke, dust. */
  wind: Vec3Like;
  /** Hurricane category 0..5 (v5 escalation hook). */
  cat?: number;
  /** Ground/material wetness 0..1 (surfaces subsystem may read this later). */
  wetness?: number;
}

/** Per-tier hard caps + feature gates. Consumed by the budget governor. */
export interface TierCaps {
  maxAdditive: number;
  maxSmoke: number;
  maxSparks: number;
  maxRain: number;
  maxDecals: number;
  maxLights: number;
  maxHero: number;
  softParticles: boolean;
}

export const ZERO_WIND: Vec3Tuple = [0, 0, 0];
