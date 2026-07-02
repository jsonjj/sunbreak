// FOOT COPS (v2) — on-foot police that spawn by WANTED LEVEL, chase the player through the streets,
// and shoot via the combat system. The cop CARS (dispatch/pursuit) still spawn for flavour; these
// are the on-foot threat the brief asks for: officers hunting the player who can be KILLED (each
// carries stat_health + a hittable combat capsule). Wanted level sets the NUMBER of cops and the
// POWER of their weapons (escalation table below). Hitting/killing one feeds the contact-driven
// wanted formula as an OFFICER (cop_unit → victimKind "police"), so cop-vs-civ weighting applies.

import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { detachCharacter, spawnCharacterEntity } from "@/systems/gameplay/character-content";
import { enemyFireAt } from "@/systems/gameplay/combat";
import { useGameStore } from "@/stores/game.store";
import "./wanted.components";
import { playerQuery } from "./queries";
import { useWantedStore } from "./store";
import type { CopUnit } from "./types";

type W = typeof world;

// ── Escalation: star → cop COUNT + weapon POWER (accuracy + health scale too) ─────────────────
export interface CopTier {
  count: number;
  weapon: string; // combat weapon id (stronger guns at higher stars)
  accuracy: number; // 0..1 base hit chance at close range
  health: number;
}
export const COP_ESCALATION: Record<number, CopTier> = {
  0: { count: 0, weapon: "pistol_9mm", accuracy: 0, health: 100 },
  1: { count: 2, weapon: "pistol_9mm", accuracy: 0.32, health: 100 },
  2: { count: 3, weapon: "pistol_9mm", accuracy: 0.42, health: 110 },
  3: { count: 4, weapon: "smg_vector", accuracy: 0.5, health: 120 },
  4: { count: 6, weapon: "rifle_carbine", accuracy: 0.56, health: 140 },
  5: { count: 8, weapon: "rifle_carbine", accuracy: 0.64, health: 170 },
};

const COP_CENTER_Y = 0.9; // transform Y = body CENTRE → combat hitbox y∈[0,1.8] (matches player/peds)
const COP_YOFFSET = -0.9; // drop the feet-origin rig to the ground
const SPAWN_RING = 46; // spawn this far from the player (off the immediate screen)
const SPAWN_RING_JITTER = 10;
const RETREAT_R = 150; // recycle a cop that falls this far behind
const CHASE_SPEED = 5.6; // m/s on-foot chase
const STANDOFF = 9; // hold-and-shoot distance (m)
const FIRE_INTERVAL_S = 0.9;
const SPAWN_INTERVAL_S = 1.3; // trickle cops in, not all at once
const CORPSE_LINGER_S = 3;
const MAX_DT = 0.05;

const cops = world.with("cop_unit", "transform");
let nextCopNet = 2_000_000; // high base so cop ids never collide with player/vehicles/peds
let spawnCooldown = 0;

function spawnCop(px: number, pz: number, tier: CopTier, star: number): void {
  const ang = Math.random() * Math.PI * 2;
  const r = SPAWN_RING + Math.random() * SPAWN_RING_JITTER;
  const x = px + Math.cos(ang) * r;
  const z = pz + Math.sin(ang) * r;
  const yaw = Math.atan2(px - x, pz - z); // face the player
  const { entity } = spawnCharacterEntity("police", {
    position: [x, COP_CENTER_Y, z],
    yaw,
    yOffset: COP_YOFFSET,
  });
  entity.netId = nextCopNet++;
  world.addComponent(entity, "stat_health", { current: tier.health, max: tier.health, armor: 0 });
  const unit: CopUnit = {
    weapon: tier.weapon,
    accuracy: tier.accuracy,
    star,
    fireT: 0.4 + Math.random() * 0.6,
    state: "chase",
    spawnedAt: performance.now(),
    deadAt: 0,
  };
  world.addComponent(entity, "cop_unit", unit);
}

function removeCop(e: ClientEntity): void {
  detachCharacter(e);
  world.remove(e);
}

export function tickFootCops(dtRaw: number): void {
  const dt = dtRaw > MAX_DT ? MAX_DT : dtRaw;
  const playing = useGameStore.getState().phase === "playing";
  const player = playerQuery.entities[0];
  const pt = player?.transform?.position;
  const stars = playing ? useWantedStore.getState().stars : 0;
  const tier = COP_ESCALATION[Math.max(0, Math.min(5, stars))] ?? COP_ESCALATION[0]!;
  const now = performance.now();

  const toRemove: ClientEntity[] = [];
  let living = 0;

  for (const e of cops) {
    const u = e.cop_unit!;
    const t = e.transform!;
    const hp = e.stat_health;

    // Corpse linger → cleanup.
    if (u.state === "dead") {
      if (now - u.deadAt > CORPSE_LINGER_S * 1000) toRemove.push(e);
      continue;
    }
    // Death (killed by the player or caught in crossfire).
    if (e.isDead || (hp && hp.current <= 0)) {
      u.state = "dead";
      u.deadAt = now;
      if (e.movement) {
        e.movement.speed = 0;
        e.movement.normalizedSpeed = 0;
        e.movement.mode = "idle";
      }
      continue;
    }

    // Wanted cleared / player gone / cop stranded → the cop stands down.
    if (!playing || stars === 0 || !pt) {
      toRemove.push(e);
      continue;
    }

    const dx = pt.x - t.position.x;
    const dz = pt.z - t.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    if (dist > RETREAT_R) {
      toRemove.push(e);
      continue;
    }
    living++;

    // Face + chase toward the standoff.
    let moved = 0;
    if (dist > STANDOFF) {
      const step = Math.min(CHASE_SPEED * dt, dist - STANDOFF);
      t.position.x += (dx / dist) * step;
      t.position.z += (dz / dist) * step;
      moved = step;
    }
    t.position.y = COP_CENTER_Y;
    if (e.movement) {
      e.movement.facing = Math.atan2(dx, dz);
      e.movement.speed = dt > 0 ? moved / dt : 0;
      e.movement.normalizedSpeed = Math.min(1, e.movement.speed / CHASE_SPEED);
      e.movement.mode = e.movement.speed > 0.4 ? "run" : "idle";
      e.movement.grounded = true;
    }

    // Shoot to kill.
    u.fireT -= dt;
    if (u.fireT <= 0) {
      const r = enemyFireAt(e, player, u.weapon, u.accuracy);
      u.fireT = r.fired ? FIRE_INTERVAL_S : 0.35;
    }
  }

  for (const e of toRemove) removeCop(e);

  // ── Population: trickle up to the tier target; drop the farthest surplus as heat falls ──
  spawnCooldown -= dt;
  if (playing && pt && stars > 0 && living < tier.count && spawnCooldown <= 0) {
    spawnCop(pt.x, pt.z, tier, stars);
    spawnCooldown = SPAWN_INTERVAL_S;
  } else if (living > tier.count && pt) {
    let far: ClientEntity | null = null;
    let farD = -1;
    for (const e of cops) {
      if (e.cop_unit!.state === "dead") continue;
      const t = e.transform!;
      const d = (t.position.x - pt.x) ** 2 + (t.position.z - pt.z) ** 2;
      if (d > farD) {
        farD = d;
        far = e;
      }
    }
    if (far) removeCop(far);
  }
}

export const footCopSystem: System<W> = {
  name: "wanted/footCops",
  phase: "update",
  order: 45, // after pursuit (40): cars still spawn; these are the on-foot shooters
  fn: (_w, dt) => tickFootCops(dt),
};
