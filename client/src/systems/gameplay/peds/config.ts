// Per-quality tunables + archetype table + fixed constants for the ped sim.
// All feel/perf numbers live here so they're fast to iterate. No side effects.

import { PedArchetype, type QualityTier } from "@sunbreak/shared";
import type { LodTier } from "./types";

/** Hard ceiling on simultaneously-live peds (sizes the entity pool + instance buffers). */
export const PED_HARD_CAP = 260;

/** Ground plane height (m). Peds are kinematic; no terrain sampling yet, so we pin to this. */
export const PED_GROUND_Y = 0;
/** Capsule half-total-height → instance/transform Y so feet rest on PED_GROUND_Y. */
export const PED_CENTER_Y = PED_GROUND_Y + 0.9;

/** Ped body capsule (mirrors the v0 player capsule so scale reads correctly). */
export const PED_RADIUS = 0.3;
export const PED_HALF_HEIGHT = 0.6; // capsule cylinder half-length (total height ≈ 1.8m)

// ── Density / spawn ───────────────────────────────────────────────────────────────────────
/** Active-ped target per quality tier (governor may lower this under frame-time pressure). */
export const DENSITY_BY_TIER: Record<QualityTier, number> = {
  low: 60,
  medium: 130,
  high: 220,
};

/** Spawn just outside the near view, despawn past the cull ring (both off-screen when possible). */
export const SPAWN_MIN_R = 32; // m — inner annulus radius
export const SPAWN_MAX_R = 68; // m — outer annulus radius
export const CULL_R = 122; // m — despawn beyond this
export const SPAWN_HZ = 4; // population-director cadence (Hz)
export const SPAWN_PER_TICK = 6; // max peds introduced per director tick (avoid burst hitches)

/** Weighted archetype spawn mix (must be same keys as ARCHETYPES). */
export const ARCHETYPE_WEIGHTS: Record<PedArchetype, number> = {
  [PedArchetype.Civilian]: 0.62,
  [PedArchetype.Business]: 0.16,
  [PedArchetype.Tourist]: 0.12,
  [PedArchetype.Gangster]: 0.06,
  [PedArchetype.Police]: 0.04,
};

export interface ArchetypeDef {
  archetype: PedArchetype;
  /** Base colour (hex) for the instanced body; per-instance jitter added at spawn. */
  color: number;
  /** Comfortable walk speed (m/s). */
  walk: number;
  /** Flee/run speed (m/s). */
  run: number;
  /** Baseline max health for `stat_health`. */
  health: number;
  /** How easily this archetype panics (fear multiplier). */
  jumpiness: number;
}

export const ARCHETYPES: Record<PedArchetype, ArchetypeDef> = {
  [PedArchetype.Civilian]: {
    archetype: PedArchetype.Civilian,
    color: 0x9fb2c4,
    walk: 1.35,
    run: 5.0,
    health: 100,
    jumpiness: 1.0,
  },
  [PedArchetype.Business]: {
    archetype: PedArchetype.Business,
    color: 0x2c3550,
    walk: 1.5,
    run: 4.6,
    health: 100,
    jumpiness: 1.1,
  },
  [PedArchetype.Tourist]: {
    archetype: PedArchetype.Tourist,
    color: 0xf2b338,
    walk: 1.1,
    run: 4.2,
    health: 90,
    jumpiness: 1.25,
  },
  [PedArchetype.Gangster]: {
    archetype: PedArchetype.Gangster,
    color: 0x3a2f2a,
    walk: 1.4,
    run: 5.4,
    health: 130,
    jumpiness: 0.55, // hardened — slower to flee
  },
  [PedArchetype.Police]: {
    archetype: PedArchetype.Police,
    color: 0x1f4e79,
    walk: 1.45,
    run: 5.2,
    health: 150,
    jumpiness: 0.4,
  },
};

// ── LOD ──────────────────────────────────────────────────────────────────────────────────
export interface LodTierDef {
  tier: LodTier;
  /** Upper distance bound (m) for this tier. */
  maxDist: number;
  /** Simulate movement every Nth director frame (1 = every frame). */
  tickEvery: number;
}

/** Ordered near→far. Beyond the last finite bound = Cull (statistical / not moved). */
export const LOD_TIERS: readonly LodTierDef[] = [
  { tier: 0, maxDist: 25, tickEvery: 1 }, // full sim + reactions, every frame
  { tier: 1, maxDist: 60, tickEvery: 1 }, // full sim, every frame
  { tier: 2, maxDist: 120, tickEvery: 4 }, // path-follow only, ~round-robin
  { tier: 3, maxDist: Number.POSITIVE_INFINITY, tickEvery: 12 }, // cull: barely ticked
] as const;

/** Number of round-robin buckets used to temporally spread far-tier movement. */
export const TICK_BUCKETS = 4;

// ── Behaviour / reactions ──────────────────────────────────────────────────────────────────
export const IDLE_MIN_S = 1.0;
export const IDLE_MAX_S = 4.0;
/** Distance (m) at which a ped is considered to have arrived at a waypoint. */
export const ARRIVE_R = 1.4;
/** Steering. */
export const PED_ACCEL = 9; // m/s² approach to desired velocity
export const SEPARATION_R = 1.1; // personal-space radius (m)
export const SEPARATION_W = 1.4; // separation steering weight
export const VEHICLE_AVOID_R = 4.5; // start dodging cars within this radius
export const VEHICLE_AVOID_W = 3.0;

/** Fear thresholds + dynamics. */
export const FLEE_THRESHOLD = 0.42; // fear above this → flee
export const PANIC_THRESHOLD = 0.82; // fear above this → panic
export const CALM_THRESHOLD = 0.08; // fear below this (after cooldown) → resume wander
export const FEAR_DECAY_PER_S = 0.55; // exponential decay rate of fear
export const CALM_COOLDOWN_S = 2.5; // min time fleeing before a ped can calm
export const FLEE_RADIUS = 45; // how far ahead we pick a flee destination (m)

/** Fear contagion — fleeing peds broadcast a weak secondary threat so panic ripples. */
export const CONTAGION_INTENSITY = 0.35;
export const CONTAGION_RADIUS = 9;
export const CONTAGION_HZ = 3; // global cadence for emitting contagion pulses

/** Default threat radii/intensities per kind (used when the caller omits them). */
export const THREAT_DEFAULTS: Record<string, { radius: number; intensity: number }> = {
  gunshot: { radius: 34, intensity: 1.0 },
  explosion: { radius: 55, intensity: 1.6 },
  vehicle: { radius: 8, intensity: 0.7 },
  melee: { radius: 6, intensity: 0.6 },
  panic: { radius: CONTAGION_RADIUS, intensity: CONTAGION_INTENSITY },
};

// ── Death / ragdoll ─────────────────────────────────────────────────────────────────────────
/** How long a dead ped lingers (instance hidden) before its pool slot is recycled (ms). */
export const RAGDOLL_LINGER_MS = 8000;

// ── Nav (fallback lattice grid) ──────────────────────────────────────────────────────────────
/** Spacing of the procedural fallback walk-lattice (m) when no road-graph is injected. */
export const GRID_SPACING = 6;
/** Half-extent (m) of the fallback lattice around the world origin. */
export const GRID_HALF_EXTENT = 900;
/** Sidewalk lateral offset from the road edge (added to width/2) when deriving from a road-graph. */
export const SIDEWALK_OFFSET = 1.6;
/** Max spacing between successive waypoints along a sidewalk polyline (m). */
export const SIDEWALK_STEP = 7;
/** Nav spatial-index bucket size (m) for nearest/annulus queries. */
export const NAV_BUCKET = 24;

// ── Adaptive governor ────────────────────────────────────────────────────────────────────────
/** Frame-time budget (s). Above this (smoothed) the governor sheds peds; below, it recovers. */
export const FRAME_BUDGET_S = 1 / 55;
export const GOVERNOR_EMA = 0.05; // smoothing factor for frame-time EMA
export const GOVERNOR_STEP = 8; // peds added/removed from the cap per adjustment
export const GOVERNOR_COOLDOWN_S = 1.2; // min seconds between cap adjustments (hysteresis)
export const GOVERNOR_MIN_CAP = 24; // never scale below this many peds

/** Resolve the active quality tier's density target. */
export const densityFor = (tier: QualityTier): number => DENSITY_BY_TIER[tier] ?? DENSITY_BY_TIER.medium;
