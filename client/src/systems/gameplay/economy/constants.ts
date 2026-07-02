// Economy tuning — curves, thresholds, and keys. Pure data; no side effects.
import type { SkillId } from "./types";

/** Bump when the persisted shape changes; drives zustand persist `migrate`. */
export const SAVE_VERSION = 1;

/** localStorage key for the persisted economy store. */
export const STORAGE_KEY = "sunbreak-economy";

/** Canonical skill order (drives defaults + UI rows). */
export const SKILL_IDS: readonly SkillId[] = [
  "shooting",
  "strength",
  "stealth",
  "driving",
  "stamina",
  "lung",
  "flying",
  "hacking",
  "charisma",
] as const;

export const SKILL_LABELS: Record<SkillId, string> = {
  shooting: "Shooting",
  strength: "Strength",
  stealth: "Stealth",
  driving: "Driving",
  stamina: "Stamina",
  lung: "Lung Capacity",
  flying: "Flying",
  hacking: "Hacking",
  charisma: "Charisma",
};

/** Milestone levels that unlock perks. */
export const MILESTONES = [25, 50, 75, 100] as const;

/**
 * Level curve: `level = floor(sqrt(xp) * SKILL_K)`, clamped 0..100.
 * With SKILL_K = 1, reaching 100 costs 10,000 xp and early levels come fast.
 */
export const SKILL_K = 1;
export const SKILL_MAX = 100;

/** Suggested XP grants per gameplay action (consumers may override per event). */
export const XP_PER_ACTION = {
  shotHit: 4,
  kill: 25,
  meleeHit: 3,
  sprintMeter: 0.02, // per metre sprinted
  driveMeter: 0.01, // per metre driven
  swimSecond: 1,
  flySecond: 1.5,
  hackSuccess: 40,
  dialogueWin: 15,
} as const;

/** Dirty→clean laundering fee (kept mid-range of the 0.15–0.30 design window). */
export const LAUNDER_HAIRCUT = 0.2;

/** Passive income accrual cadence (wall-clock, NOT per-frame). */
export const INCOME_TICK_MS = 60_000;

/** Starting balances for a fresh save. */
export const STARTING_CLEAN = 500;
export const STARTING_DIRTY = 0;
export const STARTING_BANK = 0;
export const STARTING_CREW = 0;

/** World pickup collection radius (planar metres). */
export const PICKUP_RADIUS = 2.2;

/** HUD mirror cadence for the finish-phase wallet sync (~10 Hz). */
export const HUD_SYNC_RATE = 1 / 10;

/**
 * Perk registry: which perk id unlocks at which milestone for each skill.
 * Consumers poll `usePerks()` / `economyApi.getPerks()` and check membership — read-only.
 */
export const PERKS: Partial<Record<SkillId, Partial<Record<(typeof MILESTONES)[number], string>>>> =
  {
    shooting: { 25: "shooting.recoil.25", 50: "shooting.reload.50", 100: "shooting.crit.100" },
    strength: { 25: "strength.carry.25", 50: "strength.melee.50", 100: "strength.tank.100" },
    stealth: { 50: "stealth.quiet.50", 75: "stealth.ghost.75" },
    driving: { 25: "driving.grip.25", 50: "driving.grip.50", 100: "driving.stunt.100" },
    stamina: { 25: "stamina.wind.25", 75: "stamina.marathon.75" },
    lung: { 50: "lung.deepdive.50" },
    flying: { 50: "flying.steady.50", 100: "flying.ace.100" },
    hacking: { 25: "hacking.bypass.25", 75: "hacking.override.75" },
    charisma: { 25: "charisma.haggle.25", 50: "charisma.discount.50" },
  };
