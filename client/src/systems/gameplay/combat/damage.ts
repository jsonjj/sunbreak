// Damage math + victim classification. Pure functions over the shared `Health` shape so the same
// code can run headless on the (v4) server.

import type { Health } from "@sunbreak/shared";
import { PedArchetype } from "@sunbreak/shared";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { CombatSurface, CombatVictimKind, Hitzone } from "./types";
import type { DamageFalloff, WeaponBallistics } from "./weapons";

/** Hit-zone damage multipliers. Head rewarded, limbs chip. */
export const ZONE_MULT: Record<Hitzone, number> = {
  head: 2.2,
  torso: 1.0,
  limb: 0.7,
};

/** Linear distance falloff → damage multiplier in [minMul, 1]. */
export function falloffMul(f: DamageFalloff, distance: number): number {
  if (distance <= f.start) return 1;
  if (distance >= f.end) return f.minMul;
  const t = (distance - f.start) / (f.end - f.start);
  return 1 + (f.minMul - 1) * t;
}

/** Final damage for a hit: base × falloff(distance) × zone. */
export function computeDamage(b: WeaponBallistics, distance: number, zone: Hitzone): number {
  return b.damage * falloffMul(b.falloff, distance) * ZONE_MULT[zone];
}

export interface DamageResult {
  /** Damage actually removed from health (post-armor). */
  applied: number;
  /** HP remaining after the hit. */
  remaining: number;
  lethal: boolean;
}

/**
 * Apply `amount` to a `Health` blob IN PLACE. Armor absorbs first (no regen here — the stats
 * subsystem owns regen). Returns the outcome. Clamps HP at 0.
 */
export function applyDamageToVitals(vit: Health, amount: number): DamageResult {
  let dmg = Math.max(0, amount);
  if (vit.armor > 0) {
    const toArmor = Math.min(vit.armor, dmg);
    vit.armor -= toArmor;
    dmg -= toArmor;
  }
  const applied = Math.min(vit.current, dmg);
  vit.current -= applied;
  if (vit.current < 0) vit.current = 0;
  return { applied, remaining: vit.current, lethal: vit.current <= 0 };
}

/** The canonical vitals blob for an entity: `stat_health` (owned by stats) or the base `health`. */
export function vitalsOf(e: ClientEntity): Health | undefined {
  return e.stat_health ?? e.health;
}

/** Classify a victim for the wanted crime bridge. */
export function victimKindFor(e: ClientEntity): CombatVictimKind {
  if (e.isPlayer) return "player";
  const archetype = (e as { ped_agent?: { archetype?: PedArchetype } }).ped_agent?.archetype;
  if (archetype !== undefined) return archetype === PedArchetype.Police ? "police" : "civilian";
  if (e.isVehicle || e.vehicle) return "vehicle";
  if (e.combat_target || e.isProp) return "prop";
  return "civilian";
}

/** Impact surface for vfx (blood on actors, hard surfaces otherwise). */
export function surfaceFor(e: ClientEntity | null): CombatSurface {
  if (!e) return "concrete";
  const isPed = (e as { ped_agent?: unknown }).ped_agent !== undefined;
  if (isPed || e.isPlayer) return "flesh";
  if (e.combat_target) return "metal";
  if (e.isVehicle || e.vehicle) return "metal";
  return "concrete";
}

/** Map a hit zone to a ragdoll bone hint (matches physics/ragdoll `BoneId` values). */
export function boneForZone(zone: Hitzone): string {
  return zone === "head" ? "head" : zone === "limb" ? "armR" : "chest";
}
