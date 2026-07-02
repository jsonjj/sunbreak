// Combat BALLISTICS table — the data-driven feel of every weapon, keyed by the SAME weapon ids
// as `gameplay/inventory`'s catalog (`pistol_9mm`, `smg_vector`, …). Inventory owns identity +
// ammo/mag/reserve; combat owns how a shot behaves (damage, cadence, spread, recoil, falloff,
// pellets, projectile physics, and the cosmetic tracer/muzzle/SFX hints). Parody flavour only —
// Palmetto Arms, no real brands.
//
// To add a NEW weapon so it is actually equippable/fireable, add its id in BOTH places:
//   1. inventory `catalog/weapons.ts`  (identity: name, category, magSize, ammoType, reserve)
//   2. here                            (ballistics: damage, rpm, spread, recoil, …)
// Combat degrades to a weak-pistol fallback for any id it doesn't recognise.

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

/** Which gunshot family the audio SFX bus should play (maps to `gun_*_fire`). */
export type WeaponSfxKind = "pistol" | "smg" | "shotgun" | "rifle";

/**
 * Recoil model. Each shot kicks the shared look angles (vertical `pitch`, random horizontal
 * `yaw`); the accumulated kick is auto-recovered every frame so the reticle climbs under fire
 * and settles when you stop. Degrees.
 */
export interface RecoilSpec {
  /** Upward kick per shot (deg). */
  pitch: number;
  /** Max random horizontal kick per shot (± deg). */
  yaw: number;
  /** Recovery speed (deg/s the residual eases back toward zero). */
  recoverDegPerSec: number;
  /** Recoil scale while aiming down sights (ADS steadies the weapon). */
  adsMul: number;
}

/** Cosmetic tracer look (drained by <CombatRig/>'s pooled instances). */
export interface TracerSpec {
  /** Hex color. */
  color: number;
  /** Beam thickness scale (1 = default). */
  width: number;
}

/** Cosmetic muzzle-flash look. */
export interface MuzzleSpec {
  color: number;
  scale: number;
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
  /** Kick/recovery applied to the aim while shooting. */
  recoil: RecoilSpec;
  /** Which gunshot SFX family to fire (omitted for melee / thrown). */
  sfxKind?: WeaponSfxKind;
  /** Cosmetic tracer tint/width. */
  tracer?: TracerSpec;
  /** Cosmetic muzzle-flash tint/scale. */
  muzzle?: MuzzleSpec;
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
const NO_RECOIL: RecoilSpec = { pitch: 0, yaw: 0, recoverDegPerSec: 0, adsMul: 1 };

/** Ballistics keyed by inventory weapon id. Tuned to read as a distinct GTA-style arsenal. */
export const COMBAT_WEAPONS: Record<string, WeaponBallistics> = {
  // ── Melee ─────────────────────────────────────────────────────────────────────────────────
  fists: {
    id: "fists",
    fireMode: "melee",
    auto: false,
    damage: 22,
    rpm: 150,
    reloadMs: 0,
    pellets: 1,
    spreadDeg: 0,
    adsSpreadMul: 1,
    bloom: 0,
    rangeM: 2.3,
    falloff: flat,
    impulse: 7,
    recoil: NO_RECOIL,
  },

  // ── Sidearm ───────────────────────────────────────────────────────────────────────────────
  pistol_9mm: {
    id: "pistol_9mm",
    fireMode: "hitscan",
    auto: false,
    damage: 24,
    rpm: 430,
    reloadMs: 1300,
    pellets: 1,
    spreadDeg: 1.6,
    adsSpreadMul: 0.28,
    bloom: 0.05,
    rangeM: 95,
    falloff: { start: 26, end: 55, minMul: 0.55 },
    impulse: 8,
    recoil: { pitch: 0.55, yaw: 0.18, recoverDegPerSec: 9, adsMul: 0.6 },
    sfxKind: "pistol",
    tracer: { color: 0xffe3b0, width: 1 },
    muzzle: { color: 0xfff1c0, scale: 1 },
  },

  // ── SMG (spray, low per-shot, climbs fast) ──────────────────────────────────────────────────
  smg_vector: {
    id: "smg_vector",
    fireMode: "hitscan",
    auto: true,
    damage: 15,
    rpm: 950,
    reloadMs: 1700,
    pellets: 1,
    spreadDeg: 2.8,
    adsSpreadMul: 0.55,
    bloom: 0.06,
    rangeM: 60,
    falloff: { start: 16, end: 38, minMul: 0.4 },
    impulse: 6,
    recoil: { pitch: 0.3, yaw: 0.24, recoverDegPerSec: 15, adsMul: 0.7 },
    sfxKind: "smg",
    tracer: { color: 0xffdca0, width: 0.85 },
    muzzle: { color: 0xfff0b0, scale: 0.9 },
  },

  // ── Shotgun (pellet spread, brutal up close, useless far) ────────────────────────────────────
  shotgun_pump: {
    id: "shotgun_pump",
    fireMode: "hitscan",
    auto: false,
    damage: 9, // per pellet (×9 pellets = ~81 point-blank)
    rpm: 70,
    reloadMs: 2600,
    pellets: 9,
    spreadDeg: 6.5,
    adsSpreadMul: 0.78,
    bloom: 0.12,
    rangeM: 40,
    falloff: { start: 8, end: 24, minMul: 0.15 },
    impulse: 26,
    recoil: { pitch: 1.7, yaw: 0.45, recoverDegPerSec: 8, adsMul: 0.85 },
    sfxKind: "shotgun",
    tracer: { color: 0xffcf8a, width: 0.7 },
    muzzle: { color: 0xffe0a0, scale: 1.5 },
  },

  // ── Assault rifle (the all-rounder) ─────────────────────────────────────────────────────────
  rifle_carbine: {
    id: "rifle_carbine",
    fireMode: "hitscan",
    auto: true,
    damage: 26,
    rpm: 700,
    reloadMs: 2100,
    pellets: 1,
    spreadDeg: 1.9,
    adsSpreadMul: 0.32,
    bloom: 0.05,
    rangeM: 140,
    falloff: { start: 45, end: 95, minMul: 0.55 },
    impulse: 10,
    recoil: { pitch: 0.42, yaw: 0.16, recoverDegPerSec: 11, adsMul: 0.55 },
    sfxKind: "rifle",
    tracer: { color: 0xfff0c8, width: 1 },
    muzzle: { color: 0xfff4d0, scale: 1.1 },
  },

  // ── Sniper (one-shot torso, punishing cadence) ───────────────────────────────────────────────
  sniper_bolt: {
    id: "sniper_bolt",
    fireMode: "hitscan",
    auto: false,
    damage: 140,
    rpm: 45,
    reloadMs: 3200,
    pellets: 1,
    spreadDeg: 0.3,
    adsSpreadMul: 0.04,
    bloom: 0,
    rangeM: 450,
    falloff: { start: 180, end: 360, minMul: 0.9 },
    impulse: 34,
    recoil: { pitch: 2.4, yaw: 0.2, recoverDegPerSec: 5, adsMul: 0.7 },
    sfxKind: "rifle",
    tracer: { color: 0xffffff, width: 1.4 },
    muzzle: { color: 0xffffff, scale: 1.3 },
  },

  // ── Heavy (rocket launcher — direct/AoE) ─────────────────────────────────────────────────────
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
    recoil: { pitch: 1.4, yaw: 0.2, recoverDegPerSec: 6, adsMul: 0.8 },
    muzzle: { color: 0xffa060, scale: 1.8 },
    projectile: { speed: 48, gravity: -3, drag: 0, radius: 6, fuseMs: 0 },
  },

  // ── Thrown (grenade — arced, timed AoE) ──────────────────────────────────────────────────────
  grenade: {
    id: "grenade",
    fireMode: "projectile",
    auto: false,
    damage: 120,
    rpm: 70,
    reloadMs: 900,
    pellets: 1,
    spreadDeg: 1.5,
    adsSpreadMul: 0.8,
    bloom: 0,
    rangeM: DEFAULT_MAX_RANGE,
    falloff: flat,
    impulse: 40,
    recoil: { pitch: 0.2, yaw: 0.1, recoverDegPerSec: 10, adsMul: 1 },
    projectile: { speed: 18, gravity: -9.8, drag: 0.02, radius: 5, fuseMs: 1500 },
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
