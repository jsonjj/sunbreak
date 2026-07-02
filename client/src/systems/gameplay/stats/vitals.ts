// PURE vitals math — deterministic, allocation-conscious, no side effects, no ECS/DOM imports.
// The client systems (and a future Colyseus room) call these so the simulation stays identical
// on both sides. Every function returns a NEW Vitals; callers write the result back.

import {
  CLIMB_DRAIN,
  COMBAT_COOLDOWN_MS,
  EXHAUST_LOCK,
  FALL_LETHAL,
  FALL_SAFE,
  HIT_ZONE_MULT,
  MAX_ARMOR,
  MAX_HEALTH,
  REGEN_RATE,
  REGEN_THRESHOLD,
  SPRINT_DRAIN,
  STAMINA_REGEN,
  SWIM_DRAIN,
  staminaMaxForSkill,
} from "./constants";
import type { DamageEvent, HitZone, StaminaIntent, Vitals } from "./types";

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function zoneMult(zone: HitZone | undefined): number {
  return HIT_ZONE_MULT[zone ?? "torso"];
}

/** A brand-new full-health vitals record (optionally overridden, e.g. persisted skill). */
export function freshVitals(overrides?: Partial<Vitals>): Vitals {
  const staminaSkill = overrides?.staminaSkill ?? 0;
  const base: Vitals = {
    health: MAX_HEALTH,
    healthMax: MAX_HEALTH,
    armor: 0,
    armorMax: MAX_ARMOR,
    stamina: staminaMaxForSkill(staminaSkill),
    staminaSkill,
    ability: 0,
    alive: true,
    lastDamageAt: 0,
  };
  return overrides ? { ...base, ...overrides } : base;
}

/**
 * Apply one damage event. Armor absorbs first (unless `ignoreArmor`), then hit-zone-scaled
 * health loss; clamps at 0, updates `alive`, stamps `lastDamageAt`. No-op on the dead or on
 * zero/negative damage.
 */
export function applyDamage(s: Vitals, e: DamageEvent, now: number): Vitals {
  if (!s.alive) return s;
  let dmg = Math.max(0, e.amount) * zoneMult(e.zone);
  if (dmg <= 0) return s;

  const next: Vitals = { ...s, lastDamageAt: now };
  if (!e.ignoreArmor && next.armor > 0) {
    const absorbed = Math.min(next.armor, dmg); // armor never regenerates
    next.armor = next.armor - absorbed;
    dmg -= absorbed;
  }
  next.health = clamp(next.health - dmg, 0, next.healthMax);
  next.alive = next.health > 0;
  return next;
}

/**
 * Out-of-combat health regen toward REGEN_THRESHOLD (never to full — that needs items). Only
 * while alive, damage-free for COMBAT_COOLDOWN_MS, and below the threshold.
 */
export function tickHealthRegen(s: Vitals, dtMs: number, now: number): Vitals {
  if (!s.alive) return s;
  if (now - s.lastDamageAt <= COMBAT_COOLDOWN_MS) return s;
  const ceiling = Math.min(REGEN_THRESHOLD, s.healthMax);
  if (s.health >= ceiling) return s;
  return { ...s, health: Math.min(ceiling, s.health + REGEN_RATE * (dtMs / 1000)) };
}

/** Per-second stamina drain for the given intent (0 = recover). */
export function drainRate(intent: StaminaIntent): number {
  switch (intent) {
    case "sprint":
      return SPRINT_DRAIN;
    case "swim":
      return SWIM_DRAIN;
    case "climb":
      return CLIMB_DRAIN;
    default:
      return 0;
  }
}

/** Drain stamina by the active intent, else recover; clamped to [0, staminaMax]. */
export function tickStamina(s: Vitals, dtMs: number, intent: StaminaIntent): Vitals {
  const max = staminaMaxForSkill(s.staminaSkill);
  const dt = dtMs / 1000;
  const drain = drainRate(intent);
  const stamina =
    drain > 0
      ? Math.max(0, s.stamina - drain * dt)
      : Math.min(max, s.stamina + STAMINA_REGEN * dt);
  return stamina === s.stamina ? s : { ...s, stamina };
}

/** True while stamina is above the exhaustion lock — i.e. the player may sprint. */
export function canSprint(s: Vitals): boolean {
  return s.stamina > staminaMaxForSkill(s.staminaSkill) * EXHAUST_LOCK;
}

/** Exhausted = at/below the lock fraction (sprint disabled until recovered). */
export function isExhausted(s: Vitals): boolean {
  return !canSprint(s);
}

/** 0..1 fraction of stamina remaining (for the radial HUD ring). */
export function staminaFraction(s: Vitals): number {
  const max = staminaMaxForSkill(s.staminaSkill);
  return max <= 0 ? 0 : clamp(s.stamina / max, 0, 1);
}

/**
 * Fall damage from a landing impact speed (m/s). Ramps 0 at FALL_SAFE to full health at
 * FALL_LETHAL. Returns null below the safe threshold. Fall damage ignores armor.
 */
export function fallDamage(impactSpeed: number): DamageEvent | null {
  const speed = Math.abs(impactSpeed);
  if (speed <= FALL_SAFE) return null;
  const t = clamp((speed - FALL_SAFE) / (FALL_LETHAL - FALL_SAFE), 0, 1);
  return { amount: t * MAX_HEALTH, zone: "torso", type: "fall", ignoreArmor: true };
}
