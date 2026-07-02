// render/lighting — ECS augmentation (declaration merging). All fields are `light_`-prefixed
// and optional, per the Wave-2 contract. These are serializable POJOs (no THREE refs) so the
// same clock can later run headless on the server (v4). The live view rig lives on the entity's
// `three` view component (see rig.ts), NOT here.
import type { Vec3 } from "@sunbreak/shared";

/**
 * The world clock — the SHARED day/night "time value" this subsystem is driven by.
 *
 * Ownership: whoever creates the singleton `light_clock` entity owns the cadence. This subsystem
 * creates one as a fallback if none exists at startup, so lighting works standalone. An
 * authoritative provider (the `gameplay/daynight` subsystem, or the server via netcode) can
 * instead own it: set `autoAdvance = false` and write `hour` yourself; lighting will follow.
 */
export interface LightClock {
  /** Local time of day in hours, wrapped to [0, 24). */
  hour: number;
  /** Multiplier on real time (1 = one full cycle per `cycleSeconds`). */
  timeScale: number;
  /** Real seconds for one full 24h cycle at `timeScale === 1`. */
  cycleSeconds: number;
  /** When false, lighting stops self-advancing and reads `hour` from whoever owns it. */
  autoAdvance: boolean;
}

/**
 * Derived solar state, recomputed every frame from `light_clock.hour`. Exposed for other
 * subsystems to READ (Weather mood, gameplay stealth/visibility, VFX god-rays, HUD clock).
 * Vectors are mutated in place (no per-frame allocation).
 */
export interface LightSky {
  /** Unit vector from the world origin toward the sun. */
  sunDir: Vec3;
  /** Unit vector toward the moon (roughly antipodal to the sun). */
  moonDir: Vec3;
  /** 0 = full night, 1 = full day (smoothstep of sun elevation). */
  dayAmount: number;
  /** Sun azimuth in radians (used to rotate the IBL so reflections track the sun). */
  azimuth: number;
  /** True while the sun (not the moon) is the active key light. */
  keyAboveHorizon: boolean;
}

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** The shared day/night clock (see {@link LightClock}). Singleton. */
    light_clock?: LightClock;
    /** Derived solar/sky state, published every frame (see {@link LightSky}). */
    light_sky?: LightSky;
    /** Presence tag marking the singleton lighting-rig entity (carries the `three` view group). */
    light_rig?: true;
  }
}

export function createDefaultClock(): LightClock {
  return { hour: 8, timeScale: 1, cycleSeconds: 300, autoAdvance: true };
}

export function createDefaultSky(): LightSky {
  return {
    sunDir: { x: 0, y: 1, z: 0 },
    moonDir: { x: 0, y: -1, z: 0 },
    dayAmount: 1,
    azimuth: 0,
    keyAboveHorizon: true,
  };
}
