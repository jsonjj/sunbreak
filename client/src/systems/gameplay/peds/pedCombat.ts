// Ped COMBAT driver — owns "fight" peds (armed or aggressive) that engage the player instead of
// fleeing. Runs between the behaviour FSM (which flips them to "fight") and the wander mover (which
// skips them). Gunners approach to a standoff and shoot through combat's shared NPC-fire path;
// aggressive brawlers (unarmed gangsters) close in and swing. All damage to the player flows through
// the SAME combat pipeline the player uses, so the player's health / death / respawn just works.

import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import { enemyFireAt, enemyMelee } from "@/systems/gameplay/combat";
import { getPlayer, pedQuery } from "./queries";
import {
  ARCHETYPES,
  PED_ACCURACY,
  PED_CENTER_Y,
  PED_DISENGAGE_R,
  PED_FIGHT_SPEED_MUL,
  PED_FIRE_INTERVAL_S,
  PED_MELEE_DAMAGE,
  PED_MELEE_INTERVAL_S,
  PED_MELEE_REACH,
  PED_STANDOFF,
} from "./config";

const MAX_DT = 0.05;

export function tickPedCombat(dtRaw: number): void {
  const dt = dtRaw > MAX_DT ? MAX_DT : dtRaw;
  const player = getPlayer();
  const pt = player?.transform?.position;
  if (!player || !pt) return;

  for (const e of pedQuery) {
    const a = e.ped_agent!;
    if (a.state !== "fight") continue;
    const t = e.transform!;
    const dx = pt.x - t.position.x;
    const dz = pt.z - t.position.z;
    const dist = Math.hypot(dx, dz) || 1;

    // Disengage if the player fled far enough away or died.
    if (dist > PED_DISENGAGE_R || player.isDead) {
      a.state = "wander";
      a.target = -1;
      a.vx = 0;
      a.vz = 0;
      a.speed = 0;
      continue;
    }

    // Face the player (heading drives the instanced-crowd facing).
    a.heading = Math.atan2(dx, dz);

    const isGun = a.weapon !== null;
    const standoff = isGun ? PED_STANDOFF : 1.6;
    const run = ARCHETYPES[a.archetype].run * PED_FIGHT_SPEED_MUL;
    let moved = 0;
    if (dist > standoff + 0.5) {
      const step = Math.min(run * dt, dist - standoff);
      t.position.x += (dx / dist) * step;
      t.position.z += (dz / dist) * step;
      moved = step;
    } else if (isGun && dist < standoff - 2) {
      // Kite back a touch if the player crowds a gunner.
      const step = run * dt * 0.5;
      t.position.x -= (dx / dist) * step;
      t.position.z -= (dz / dist) * step;
      moved = step;
    }
    t.position.y = PED_CENTER_Y;
    a.speed = dt > 0 ? moved / dt : 0;

    // Advance the walk-cycle phase so the instanced rig strides while repositioning.
    const s01 = Math.min(1, a.speed / 3.6);
    const legAmp = 0.05 + 0.8 * s01;
    const strideLen = 3.28 * Math.sin(legAmp);
    a.animPhase = (a.animPhase + (strideLen > 0.02 ? a.speed / strideLen : 0) * dt) % 1;

    // Attack cadence.
    a.fireT -= dt;
    if (a.fireT > 0) continue;
    if (isGun) {
      const r = enemyFireAt(e, player, a.weapon!, PED_ACCURACY);
      a.fireT = r.fired ? PED_FIRE_INTERVAL_S : 0.3; // retry soon if no LOS / out of range
    } else if (enemyMelee(e, player, PED_MELEE_DAMAGE, PED_MELEE_REACH)) {
      a.fireT = PED_MELEE_INTERVAL_S;
    } else {
      a.fireT = 0.3;
    }
  }
}

type W = typeof world;
export const pedCombatSystem: System<W> = {
  name: "peds:combat",
  phase: "update",
  order: 35, // after behaviour (30) flips "fight"; before movement (40) which skips fighters
  fn: (_w, dt) => tickPedCombat(dt),
};
