// Local vitals types for gameplay/stats. Self-contained (only a type-only, erased import) so
// the pure reducers in `vitals.ts` stay runnable in isolation and identical to a future server
// room. See `player-stats-health.md`.

import type { CharacterId } from "@sunbreak/shared";

/** Where a hit landed — scales incoming damage. */
export type HitZone = "head" | "torso" | "limb";

/** Damage source category (for feedback, resistances, and armor rules). */
export type DamageType =
  | "bullet"
  | "melee"
  | "explosion"
  | "fall"
  | "fire"
  | "drown"
  | "vehicle"
  | "env";

/** Why the player is respawning. */
export type RespawnReason = "dead" | "busted";

/** Death/respawn state machine phase. */
export type RespawnPhase = "alive" | "dying" | "reviving";

/** Active stamina-consuming activity. */
export type StaminaIntent = "none" | "sprint" | "swim" | "climb";

/** A single damage application. Consumed by combat/physics; fed to `applyDamage`. */
export interface DamageEvent {
  amount: number;
  /** Defaults to "torso" (mult 1.0). */
  zone?: HitZone;
  /** Defaults to "bullet". */
  type?: DamageType;
  /** If true, bypasses armor (fall/fire/drown/env). */
  ignoreArmor?: boolean;
  /** Attacker netId, if any (for feedback/attribution). */
  sourceNetId?: number;
}

/** The working vitals struct the pure reducers operate on. Mirrored to/from flat ECS fields. */
export interface Vitals {
  health: number;
  healthMax: number;
  armor: number;
  armorMax: number;
  stamina: number;
  /** 0..100 skill → staminaMax. */
  staminaSkill: number;
  /** 0..1. */
  ability: number;
  alive: boolean;
  /** performance.now() ms; -0 sentinel means "never". */
  lastDamageAt: number;
}

/** Persisted, per-character vitals record (subset saved to localStorage / server). */
export interface PersistedVitals {
  health: number;
  healthMax: number;
  armor: number;
  armorMax: number;
  stamina: number;
  staminaSkill: number;
  ability: number;
  alive: boolean;
}

/** Full save blob for the two playable leads. */
export interface StatsSave {
  active: CharacterId;
  characters: Partial<Record<CharacterId, Partial<PersistedVitals>>>;
}

/** Injected wallet interface (economy subsystem). Fee is a no-op until economy lands. */
export interface EconomyBridge {
  /** Deduct a respawn fee. Returns true if paid (economy may ignore the return). */
  charge(amount: number, reason?: string): boolean | void;
}

/** Injected police interface (wanted subsystem). No-op until wanted/police lands. */
export interface PoliceBridge {
  clearWanted(): void;
}
