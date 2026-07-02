// Shared "apply one hit" path used by both hitscan (fireSystem) and AoE (projectileSystem).
// This is where the brief's core instruction lives: "apply damage by decrementing the target's
// stat_health ... and emit a shared damage/death event that ragdoll + vfx + wanted consume".

import type { Vec3 } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { Hitzone } from "./types";
import { applyDamageToVitals, surfaceFor, victimKindFor, vitalsOf } from "./damage";
import { emitDamage, emitDeath } from "./events";
import { pushImpact } from "./runtime";
import { sfxImpact } from "./integrations/audio";

export interface HitApply {
  target: ClientEntity;
  weaponId: string;
  /** Final damage (already through falloff + zone). */
  amount: number;
  zone: Hitzone;
  point: Vec3;
  normal: Vec3;
  /** Unit shot/blast direction (knockback). */
  dir: Vec3;
  impulse: number;
  melee: boolean;
  attackerNetId?: number;
  /** Spawn an impact/blood decal at the point (true for direct hits; false for AoE spam). */
  impactVfx?: boolean;
}

/**
 * Decrement the target's canonical vitals (`stat_health`, else base `health`), emit the shared
 * damage event (+ death on kill), and hand off death to the ECS (isDead) so peds' behaviour /
 * ragdoll pick it up. Idempotent against already-dead targets. Returns true if the hit landed.
 */
export function applyHit(h: HitApply): boolean {
  const { target } = h;
  if (target.isDead) return false;
  const vit = vitalsOf(target);
  if (!vit) return false;

  const res = applyDamageToVitals(vit, h.amount);
  const victimKind = victimKindFor(target);
  const surface = surfaceFor(target);
  const headshot = h.zone === "head";

  emitDamage({
    attackerNetId: h.attackerNetId,
    victimNetId: target.netId,
    victimKind,
    target,
    weaponId: h.weaponId,
    amount: res.applied,
    hitzone: h.zone,
    headshot,
    lethal: res.lethal,
    melee: h.melee,
    remaining: res.remaining,
    point: h.point,
    normal: h.normal,
    dir: h.dir,
    impulse: h.impulse,
    surface,
  });

  if (h.impactVfx) {
    pushImpact({ ...h.point, nx: h.normal.x, ny: h.normal.y, nz: h.normal.z, surface });
    sfxImpact(surface, h.point); // surface-aware; the audio bus throttles pellet spam
  }

  if (res.lethal) {
    // Shared death signal. For peds this is redundant-safe: their behaviour also detects
    // stat_health<=0 and runs the ragdoll handoff (killPed is idempotent). For combat's own
    // targets we tag the death time so targetSystem can respawn them.
    if (!target.isDead) world.addComponent(target, "isDead", true);
    if (target.combat_target) target.combat_deadAt = performance.now();

    emitDeath({
      killerNetId: h.attackerNetId,
      victimNetId: target.netId,
      victimKind,
      target,
      weaponId: h.weaponId,
      hitzone: h.zone,
      melee: h.melee,
      point: h.point,
      dir: h.dir,
      impulse: h.impulse,
    });
  }

  return true;
}
