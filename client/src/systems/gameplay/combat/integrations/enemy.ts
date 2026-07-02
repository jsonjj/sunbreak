// ENEMY (NPC) FIRE — the shared "an NPC shoots at a target" path used by armed pedestrians and
// on-foot police. It reuses the SAME damage pipeline the player uses (computeDamage → applyHit) so
// NPC bullets hurt the player exactly like the player's hurt NPCs, plus muzzle/tracer VFX + SFX.
//
// Accuracy is a probabilistic roll (degrades with distance) rather than a precise ray, so a browser
// crowd of shooters stays cheap and fair. Line-of-sight IS checked against solid geometry (when the
// combat rig is mounted) so enemies don't shoot through walls.

import { getCombatWeapon } from "../weapons";
import { computeDamage } from "../damage";
import { applyHit } from "../resolve";
import { combatRuntime, pushMuzzle, pushTracer } from "../runtime";
import { sfxGunfire } from "./audio";
import type { ClientEntity } from "@/ecs/clientEntity";

/** Muzzle height above an NPC's transform origin (transform is the body CENTER for NPCs). */
const NPC_MUZZLE_Y = 0.35;
/** Aim point height above the target's transform origin (chest). */
const TARGET_AIM_Y = 0.15;

export interface EnemyFireResult {
  /** A shot went off (visuals + SFX). */
  fired: boolean;
  /** The shot connected (damage applied). */
  hit: boolean;
}

/**
 * Fire one shot from `shooter` at `target` with `weaponId`. `accuracy` (0..1) is the base hit
 * chance at close range, scaled down with distance. Returns whether a shot fired + connected.
 * Caller gates cadence (fire-rate). No-op if either lacks a transform or the target is out of range.
 */
export function enemyFireAt(
  shooter: ClientEntity,
  target: ClientEntity,
  weaponId: string,
  accuracy = 0.55,
): EnemyFireResult {
  const s = shooter.transform?.position;
  const tp = target.transform?.position;
  if (!s || !tp || target.isDead) return { fired: false, hit: false };

  const b = getCombatWeapon(weaponId);
  const ox = s.x;
  const oy = s.y + NPC_MUZZLE_Y;
  const oz = s.z;
  const tx = tp.x;
  const ty = tp.y + TARGET_AIM_Y;
  const tz = tp.z;
  let dx = tx - ox;
  let dy = ty - oy;
  let dz = tz - oz;
  const dist = Math.hypot(dx, dy, dz) || 1;
  if (dist > b.rangeM) return { fired: false, hit: false };
  dx /= dist;
  dy /= dist;
  dz /= dist;

  // Line-of-sight: hold fire if solid geometry blocks the shot (only when the rig is mounted).
  const { world: rw, rapier } = combatRuntime;
  if (rw && rapier) {
    const ray = new rapier.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz });
    // Exclude the shooter's own body if it has one (NPCs usually don't). Stop short of the target.
    const blocked = rw.castRay(ray, dist - 0.7, true, undefined, undefined, undefined, shooter.rigidBody ?? undefined);
    if (blocked) return { fired: false, hit: false };
  }

  // Visuals + audio (best-effort; degrade silently if the rig/audio isn't up).
  pushMuzzle({ x: ox, y: oy, z: oz });
  pushTracer({ x0: ox, y0: oy, z0: oz, x1: tx, y1: ty, z1: tz });
  try {
    sfxGunfire(b.sfxKind, { x: ox, y: oy, z: oz });
  } catch {
    /* audio not ready */
  }

  // Distance-scaled accuracy roll.
  const acc = accuracy * Math.max(0.2, 1 - dist / (b.rangeM * 1.25));
  const hit = Math.random() < acc;
  if (hit) {
    applyHit({
      target,
      weaponId,
      amount: computeDamage(b, dist, "torso"),
      zone: "torso",
      point: { x: tx, y: ty, z: tz },
      normal: { x: -dx, y: -dy, z: -dz },
      dir: { x: dx, y: dy, z: dz },
      impulse: b.impulse,
      melee: false,
      attackerNetId: shooter.netId,
      impactVfx: true,
    });
  }
  return { fired: true, hit };
}

/** Melee jab from `attacker` to `target` (fists/aggressive peds). Applies damage if within `reach`. */
export function enemyMelee(
  attacker: ClientEntity,
  target: ClientEntity,
  damage: number,
  reach = 2.2,
): boolean {
  const s = attacker.transform?.position;
  const tp = target.transform?.position;
  if (!s || !tp || target.isDead) return false;
  const dx = tp.x - s.x;
  const dz = tp.z - s.z;
  if (dx * dx + dz * dz > reach * reach) return false;
  const l = Math.hypot(dx, dz) || 1;
  applyHit({
    target,
    weaponId: "fists",
    amount: damage,
    zone: "torso",
    point: { x: tp.x, y: tp.y + TARGET_AIM_Y, z: tp.z },
    normal: { x: -dx / l, y: 0, z: -dz / l },
    dir: { x: dx / l, y: 0, z: dz / l },
    impulse: 4,
    melee: true,
    attackerNetId: attacker.netId,
    impactVfx: true,
  });
  return true;
}
