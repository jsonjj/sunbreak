// Data-driven tuning tables for the wanted/police subsystem. Ported from the spec's four
// tables (crime→heat, tier→budget, cooldown, perception) plus web performance budgets. Kept
// as plain typed consts so they stay import-safe on client + (v4) server.
import type { WantedCrimeType, UnitArchetype } from "./types";
import type { TierName } from "@/render/quality/tiers";

export const MAX_STARS = 5;

/**
 * Heat points required to reach each star tier (index === star level). Crimes ratchet `heat`
 * up (and floor it to a crime's `minStars`); cooldown ratchets it back down one tier at a time.
 */
export const STAR_THRESHOLDS: readonly number[] = [0, 1, 3, 6, 10, 16];

export interface CrimeHeat {
  /** heat points added when the crime is witnessed/heard. */
  delta: number;
  /** the star floor this crime forces (e.g. a kill is at least ★2). */
  minStars: number;
  /** default audible radius in metres (witnesses inside this always "hear" it). */
  loudness: number;
  /** true for crimes loud enough to be reported by ambient/unseen witnesses. */
  loud: boolean;
}

/** Crime → heat (spec table 1). Only applied when witnessed or heard. */
export const CRIME_HEAT: Record<WantedCrimeType, CrimeHeat> = {
  brandish: { delta: 1, minStars: 1, loudness: 12, loud: false },
  fistfight: { delta: 1, minStars: 1, loudness: 10, loud: false },
  recklessDrive: { delta: 1, minStars: 1, loudness: 18, loud: false },
  hitPed: { delta: 1, minStars: 1, loudness: 18, loud: false },
  vehicleTheft: { delta: 2, minStars: 1, loudness: 15, loud: false },
  gunfire: { delta: 2, minStars: 2, loudness: 40, loud: true },
  civilianKilled: { delta: 3, minStars: 2, loudness: 25, loud: true },
  officerAttacked: { delta: 2, minStars: 3, loudness: 25, loud: true },
  officerKilled: { delta: 3, minStars: 3, loudness: 30, loud: true },
  explosion: { delta: 3, minStars: 3, loudness: 80, loud: true },
};

export interface TierBudget {
  cruisers: number;
  foot: number;
  roadblocks: number;
  /** 0..1 — biases the pursuit utility toward ram/PIT/shoot at higher tiers. */
  aggression: number;
  /** archetypes unlocked at this tier (besides cruiser/foot). */
  extras: UnitArchetype[];
}

/** Tier → unit budget & behaviour (spec table 2, web-scaled). Heli/gunship are v3+. */
export const TIER_BUDGETS: Record<number, TierBudget> = {
  0: { cruisers: 0, foot: 0, roadblocks: 0, aggression: 0, extras: [] },
  1: { cruisers: 2, foot: 0, roadblocks: 0, aggression: 0.15, extras: [] },
  2: { cruisers: 3, foot: 1, roadblocks: 1, aggression: 0.35, extras: [] },
  3: { cruisers: 4, foot: 2, roadblocks: 1, aggression: 0.55, extras: ["unmarked"] },
  4: { cruisers: 5, foot: 3, roadblocks: 2, aggression: 0.8, extras: ["unmarked", "srtVan"] },
  5: { cruisers: 6, foot: 4, roadblocks: 3, aggression: 1.0, extras: ["unmarked", "srtVan"] },
};

/** Cooldown: uncontested clear time per tier in seconds (spec table 3). */
export const COOLDOWN_S: Record<number, number> = { 1: 20, 2: 30, 3: 45, 4: 60, 5: 80 };

/** Perception per archetype: sight cone + range + hearing range (spec table 3). */
export const ARCHETYPE_PERCEPTION: Record<
  UnitArchetype,
  { fovDeg: number; range: number; hearRange: number }
> = {
  cruiser: { fovDeg: 120, range: 45, hearRange: 40 },
  foot: { fovDeg: 90, range: 25, hearRange: 40 },
  unmarked: { fovDeg: 110, range: 42, hearRange: 40 },
  srtVan: { fovDeg: 100, range: 42, hearRange: 50 },
};

/** District-scaled first-response time (urban default; grows with the World subsystem). */
export const RESPONSE_TIME_S = { urban: 6, suburb: 18, rural: 40, default: 6 } as const;

/** Seconds between reinforcement spawns once wanted (trickle-in, not all at once). */
export const REINFORCE_STAGGER_S = 1.6;

/** Hard hero caps per quality tier (spec: MAX_HERO_POLICE). Heli disabled on Low (v3+). */
export const MAX_HERO_POLICE: Record<TierName, number> = { low: 6, medium: 10, high: 16 };

// ── Web performance budgets ──────────────────────────────────────────────────
/** Max LOS raycasts per frame, round-robin across witnesses (spec). */
export const MAX_LOS_RAYS_PER_FRAME = 16;
/** FSM decision rate (spec: 10 Hz via accumulator; movement still integrates every frame). */
export const FSM_HZ = 10;
/** Perception sampling rate (spec: 5–10 Hz). */
export const PERCEPTION_HZ = 8;
/** Grace after losing sight before a unit flips PURSUE→SEARCH (spec: LOS_LOST_GRACE). */
export const LOS_LOST_GRACE = 2;
/** Radius around the last-known-position that units sweep while searching. */
export const SEARCH_RADIUS_M = 55;
/** Off-screen ring radius where reinforcements spawn (beyond the chase bubble). */
export const SPAWN_RING_M = 70;
/** Distance a RETURNing unit must reach before it's recycled to the pool. */
export const RECYCLE_DIST_M = 120;

/** m/s cruising speeds per archetype (kinematic pursuit, not raycast-vehicle in v2). */
export const UNIT_SPEED: Record<UnitArchetype, number> = {
  cruiser: 17,
  foot: 6.2,
  unmarked: 18,
  srtVan: 14,
};

/** Stand-off distance the pursuer holds from the suspect before ramming/PIT (metres). */
export const UNIT_STANDOFF: Record<UnitArchetype, number> = {
  cruiser: 6,
  foot: 2.5,
  unmarked: 6,
  srtVan: 7,
};

/** Ground Y for spawned units (flat v0 playground; World streaming will refine later). */
export const GROUND_Y = { car: 0.5, foot: 0.9 } as const;

export const starForHeat = (heat: number): number => {
  let s = 0;
  for (let i = 1; i < STAR_THRESHOLDS.length; i++) {
    if (heat >= (STAR_THRESHOLDS[i] ?? Infinity)) s = i;
  }
  return s;
};

export const heatFloorForStars = (stars: number): number =>
  STAR_THRESHOLDS[Math.max(0, Math.min(MAX_STARS, stars))] ?? 0;
