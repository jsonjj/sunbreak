// ─────────────────────────────────────────────────────────────────────────────
// SUNBREAK — gameplay/daynight — PUBLIC READ CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// This is the single authoritative *world-environment model* shape. Every other
// subsystem (lighting/sky, vfx, traffic/ped, vehicle physics, hud, audio) reads
// these two POJOs. They are published on a well-known ECS singleton entity as
// `time_env` (EnvSnapshot) + `time_effects` (EnvEffects), and mirrored (coarse,
// throttled) into a zustand store for reactive HUD.
//
// All values are plain, serializable POJOs (numbers / strings / bools / arrays)
// so the exact same model can run headless on the (v4) server.

import type { Vec3, Vec3Tuple } from "@sunbreak/shared";

/** The four canonical Verano/Santa-Vista weather states. */
export type WeatherKind = "clear" | "rain" | "storm" | "hurricane";

/**
 * The continuous per-frame environment state. Updated IN PLACE on the singleton
 * every `update` frame (allocation-free), so ECS consumers can read live values,
 * and R3F consumers can read via the transient hooks/accessors with no re-render.
 */
export interface EnvSnapshot {
  /** Continuous in-game minutes, 0..1440 (wraps at midnight). */
  gameMinutes: number;
  /** Normalized time-of-day, 0..1 (0 = midnight, 0.5 = noon). */
  tod01: number;
  /** Integer clock hour, 0..23 (convenience mirror of gameMinutes). */
  hour: number;
  /** Integer clock minute, 0..59. */
  minute: number;
  /** True while the sun is below the horizon. */
  isNight: boolean;
  /** Unit-ish direction *towards* the sun in world space (+y up). Feed drei <Sky sunPosition>. */
  sun: Vec3;
  /** Current weather state. */
  weather: WeatherKind;
  /** Forecast — the next weather state the FSM will commit to (telegraph / darkening ramp). */
  nextWeather: WeatherKind;
  /** Cloud cover, 0..1 (damped). */
  cloud: number;
  /** Rain intensity, 0..1 (damped). */
  rain: number;
  /** Fog density, 0..1 (damped). Feed exponential fog. */
  fog: number;
  /** World wind as direction * speed (m/s). [x, y(=0), z]. */
  wind: Vec3Tuple;
  /** Lightning likelihood, 0..1 (drives `lightning` events + emissive flash budget). */
  lightningRate: number;
  /** Water/wave amplitude, 0..1 (for ocean/canal shaders). */
  waveAmp: number;
  /** Wetness accumulator, 0..1. Rises while raining, decays when dry. Drives road grip + puddles. */
  wetness: number;
}

/**
 * Pure derived gameplay signals (from `deriveEffects`). Recomputed IN PLACE each
 * frame on the singleton as `time_effects`. This is what traffic/ped spawners and
 * vehicle physics consume — they never need to re-derive.
 */
export interface EnvEffects {
  /** Traffic spawn/target-density multiplier, 0..1 (time-of-day curve × weather penalty). */
  trafficDensity: number;
  /** Ped spawn/target-density multiplier, 0..1. */
  pedDensity: number;
  /** Longitudinal wheel-friction multiplier, 0.5..1 (lower when wet). */
  roadGrip: number;
  /** Lateral (side) friction multiplier, 0.6..1 (lower when wet → more slide). */
  sideFrictionScale: number;
  /** Visibility fog, 0..1 (mirror of `EnvSnapshot.fog` for convenience). */
  visibilityFog: number;
  /** True when wet + heavy rain — vehicles should risk hydroplaning. */
  hydroplaneRisk: boolean;
  /** True during a hurricane — evac/curfew flag for traffic/ped AI + missions. */
  curfew: boolean;
}

/**
 * Control surface for missions/cutscenes/debug. Lives on the singleton as
 * `time_control`; mutate via the setters exported from `./store`.
 */
export interface EnvControlState {
  /** Freeze the clock (weather still damps). */
  paused: boolean;
  /** Hold the clock but keep the sim otherwise live (scripted beats). */
  timeLocked: boolean;
  /** Stop the FSM from rolling; damp toward `forcedKind` if set. */
  weatherLocked: boolean;
  /** Game-minutes advanced per real second (default 1 → a 24-real-minute day). */
  timeScale: number;
  /** Hurricane-weight multiplier for the FSM (hurricane-season bias). */
  seasonBias: number;
  /** When `weatherLocked`, damp toward this state; `null` = follow FSM. */
  forcedKind: WeatherKind | null;
  /** One-shot imperative time jump (game-minutes); consumed & cleared by the director. */
  setMinutes: number | null;
}
