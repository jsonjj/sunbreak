// All gameplay/stats tunables in one place (fast to iterate, identical on a future server).
// Values from `gta6-build/03-gameplay/player-stats-health.md`.

// --- Health / armor ----------------------------------------------------------------------
export const MAX_HEALTH = 100;
/** Armor pickup tiers (a pickup raises armor TO the tier value, never above the cap). */
export const ARMOR_TIERS = { none: 0, light: 50, heavy: 100 } as const;
export type ArmorTier = keyof typeof ARMOR_TIERS;
export const MAX_ARMOR = ARMOR_TIERS.heavy; // 100
/** Damage multiplier by hit zone. */
export const HIT_ZONE_MULT = { head: 2.0, torso: 1.0, limb: 0.65 } as const;

// --- Regen (GTA-style: only back up to a threshold; items required beyond) ---------------
export const REGEN_THRESHOLD = 50; // hp
export const REGEN_RATE = 8; // hp/s
export const COMBAT_COOLDOWN_MS = 5000; // must be damage-free this long before regen starts

// --- Stamina -----------------------------------------------------------------------------
export const STAMINA_BASE = 100;
export const SPRINT_DRAIN = 18; // /s
export const SWIM_DRAIN = 10; // /s
export const CLIMB_DRAIN = 25; // /s
export const STAMINA_REGEN = 22; // /s
/** Sprint is blocked until stamina recovers above this fraction of max (exhaustion hysteresis). */
export const EXHAUST_LOCK = 0.15;

// --- Fall damage -------------------------------------------------------------------------
export const FALL_SAFE = 8; // m/s — below this: no damage
export const FALL_LETHAL = 22; // m/s — at/above this: full-health damage

// --- Special ability ---------------------------------------------------------------------
export const ABILITY_MAX = 1; // 0..1

// --- Economy sinks -----------------------------------------------------------------------
export const HOSPITAL_FEE = 500;
export const BUST_FEE = 750;

// --- Death → respawn flow (seconds; frame-driven, dt-scaled) -----------------------------
export const FADE_OUT_S = 0.6; // alive → black
export const FADE_HOLD_S = 0.4; // black hold while teleport + reset happen
export const FADE_IN_S = 0.6; // black → alive
/** Post-respawn invulnerability window (prevents instant re-death / respawn loops). */
export const INVULN_MS = 2000;

// --- HUD mirror --------------------------------------------------------------------------
export const HUD_SYNC_HZ = 12; // throttle for pushing vitals into the HUD store
/** Low-frequency localStorage autosave interval. */
export const AUTOSAVE_MS = 4000;

/** Persisted-save localStorage key (subsystem-prefixed to avoid collisions). */
export const SAVE_KEY = "sunbreak.stats";

/** staminaMax for a given Stamina skill (0..100). */
export function staminaMaxForSkill(skill: number): number {
  const s = skill < 0 ? 0 : skill > 100 ? 100 : skill;
  return STAMINA_BASE + s * 1.5;
}
