// Combat BALLISTICS table — the data-driven feel of every weapon, keyed by the SAME weapon ids
// as `gameplay/inventory`'s catalog (`pistol_9mm`, `smg_vector`, …). Inventory owns identity +
// ammo/mag/reserve; combat owns how a shot behaves (damage, cadence, spread, recoil, falloff,
// pellets, projectile physics). Parody flavour only — Palmetto Arms, no real brands.

import type { FireMode } from "./types";
import { DEFAULT_MAX_RANGE } from "./constants";

export interface DamageFalloff {
  /** Full damage up to this range (m). */
  start: number;
  /** Minimum multiplier reached at/after this range (m). */
  end: number;
  /** Damage multiplier floor at/after `end` (0..1). */
  minMul: number;
}

export interface WeaponBallistics {
  id: string;
  fireMode: FireMode;
  /** Full-auto (hold to fire) vs semi (one shot per trigger pull). */
  auto: boolean;
  /** Base damage per hit (or per pellet for shotguns). */
  damage: number;
  /** Rounds per minute — the fire-rate cadence gate. */
  rpm: number;
  /** Reload duration (ms) — combat owns the timer; inventory moves the ammo. */
  reloadMs: number;
  /** Pellets per shot (>1 = shotgun; each pellet is its own ray). */
  pellets: number;
  /** Base spread half-angle in degrees (hip-fire). */
  spreadDeg: number;
  /** Spread multiplier while aiming down sights (ADS tightens the cone). */
  adsSpreadMul: number;
  /** Recoil bloom added per shot (0..1, decays when not firing). */
  bloom: number;
  /** Hitscan max range (m). */
  rangeM: number;
  /** Distance damage falloff. */
  falloff: DamageFalloff;
  /** Knockback / ragdoll impulse magnitude suggested on hit. */
  impulse: number;
  /** Projectile physics (only for `fireMode === "projectile"`). */
  projectile?: {
    speed: number; // m/s muzzle velocity
    gravity: number; // m/s² (negative)
    drag: number; // per-second velocity retained fraction penalty (0 = none)
    radius: number; // AoE radius (m); 0 = direct only
    fuseMs: number; // 0 = detonate on impact only (rocket); >0 = timed (grenade)
  };
}

const flat: DamageFalloff = { start: 9999, end: 10000, minMul: 1 };

/** Ballistics keyed by inventory weapon id. */
export const COMBAT_WEAPONS: Record<string, WeaponBallistics> = {
  fists: {
    id: "fists",
    fireMode: "melee",
    auto: false,
    damage: 18,
    rpm: 130,
    reloadMs: 0,
    pellets: 1,
    spreadDeg: 0,
    adsSpreadMul: 1,
    bloom: 0,
    rangeM: 2.2,
    falloff: flat,
    impulse: 5,
  },
  pistol_9mm: {
    id: "pistol_9mm",
    fireMode: "hitscan",
    auto: false,
    damage: 26,
    rpm: 450,
    reloadMs: 1300,
    pellets: 1,
    spreadDeg: 1.1,
    adsSpreadMul: 0.35,
    bloom: 0.06,
    rangeM: 90,
    falloff: { start: 22, end: 46, minMul: 0.5 },
    impulse: 8,
  },
  smg_vector: {
    id: "smg_vector",
    fireMode: "hitscan",
    auto: true,
    damage: 16,
    rpm: 900,
    reloadMs: 1700,
    pellets: 1,
    spreadDeg: 2.4,
    adsSpreadMul: 0.5,
    bloom: 0.05,
    rangeM: 70,
    falloff: { start: 18, end: 40, minMul: 0.45 },
    impulse: 6,
  },
  shotgun_pump: {
    id: "shotgun_pump",
    fireMode: "hitscan",
    auto: false,
    damage: 11, // per pellet
    rpm: 75,
    reloadMs: 2600,
    pellets: 8,
    spreadDeg: 7.5,
    adsSpreadMul: 0.7,
    bloom: 0.1,
    rangeM: 42,
    falloff: { start: 9, end: 26, minMul: 0.2 },
    impulse: 22,
  },
  rifle_carbine: {
    id: "rifle_carbine",
    fireMode: "hitscan",
    auto: true,
    damage: 28,
    rpm: 720,
    reloadMs: 2100,
    pellets: 1,
    spreadDeg: 1.7,
    adsSpreadMul: 0.35,
    bloom: 0.045,
    rangeM: 130,
    falloff: { start: 40, end: 85, minMul: 0.55 },
    impulse: 10,
  },
  sniper_bolt: {
    id: "sniper_bolt",
    fireMode: "hitscan",
    auto: false,
    damage: 130,
    rpm: 48,
    reloadMs: 3200,
    pellets: 1,
    spreadDeg: 0.2,
    adsSpreadMul: 0.05,
    bloom: 0.0,
    rangeM: 400,
    falloff: { start: 150, end: 320, minMul: 0.85 },
    impulse: 30,
  },
  launcher_rpg: {
    id: "launcher_rpg",
    fireMode: "projectile",
    auto: false,
    damage: 150,
    rpm: 40,
    reloadMs: 3500,
    pellets: 1,
    spreadDeg: 0.4,
    adsSpreadMul: 0.4,
    bloom: 0,
    rangeM: DEFAULT_MAX_RANGE,
    falloff: flat,
    impulse: 60,
    projectile: { speed: 46, gravity: -3.5, drag: 0, radius: 6, fuseMs: 0 },
  },
  grenade: {
    id: "grenade",
    fireMode: "projectile",
    auto: false,
    damage: 120,
    rpm: 55,
    reloadMs: 900,
    pellets: 1,
    spreadDeg: 1.5,
    adsSpreadMul: 0.8,
    bloom: 0,
    rangeM: DEFAULT_MAX_RANGE,
    falloff: flat,
    impulse: 40,
    projectile: { speed: 17, gravity: -9.8, drag: 0.02, radius: 5, fuseMs: 1600 },
  },
};

/** Sensible fallback for an unknown/unmapped weapon id (behaves like a weak pistol). */
export const DEFAULT_BALLISTICS: WeaponBallistics = COMBAT_WEAPONS.pistol_9mm!;

export function getCombatWeapon(id: string | null | undefined): WeaponBallistics {
  if (!id) return DEFAULT_BALLISTICS;
  return COMBAT_WEAPONS[id] ?? DEFAULT_BALLISTICS;
}

/** Minimum ms between shots for a given fire rate. */
export function fireIntervalMs(b: WeaponBallistics): number {
  return b.rpm > 0 ? 60000 / b.rpm : 0;
}
