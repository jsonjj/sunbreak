// UPDATE-phase projectile sim: pooled ballistic entities (RPG rocket, thrown grenade). Manual
// gravity/drag integration + a per-frame SWEPT raycast (prev→current) so fast rounds can't tunnel
// through walls/actors. Impact (or fuse timeout) → AoE damage via the shared applyHit path.

import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { WeaponBallistics } from "../weapons";
import { castCombatRay, forEachDamageableNear } from "../hitscan";
import { applyHit } from "../resolve";
import { getMuzzle, pushImpact, type Aim } from "../runtime";
import { sfxExplosion } from "../integrations/audio";
import { PROJECTILE_CAP, PROJECTILE_MAX_LIFE_MS } from "../constants";

type W = typeof world;

const projectiles = world.with("combat_projectile", "transform");
const playersQuery = world.with("isPlayer");
const muzzle = { x: 0, y: 0, z: 0 };

/** Spawn a projectile from the player's muzzle along the aim direction. */
export function spawnProjectile(
  player: ClientEntity,
  aim: Aim,
  b: WeaponBallistics,
  weaponId: string,
  now: number,
): void {
  const pj = b.projectile;
  if (!pj) return;
  if (projectiles.entities.length >= PROJECTILE_CAP) return;

  const ok = getMuzzle(muzzle);
  const sx = ok ? muzzle.x : aim.ox;
  const sy = ok ? muzzle.y : aim.oy;
  const sz = ok ? muzzle.z : aim.oz;

  world.add({
    combat_projectile: {
      weaponId,
      ownerNetId: player.netId ?? 1,
      vx: aim.dx * pj.speed,
      vy: aim.dy * pj.speed,
      vz: aim.dz * pj.speed,
      gravity: pj.gravity,
      drag: pj.drag,
      damage: b.damage,
      radius: pj.radius,
      impulse: b.impulse,
      px: sx,
      py: sy,
      pz: sz,
      bornAt: now,
      fuseMs: pj.fuseMs,
    },
    transform: {
      position: { x: sx, y: sy, z: sz },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
  });
}

function detonate(
  e: ClientEntity,
  px: number,
  py: number,
  pz: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  directTarget: ClientEntity | null,
): void {
  const p = e.combat_projectile!;
  const attackerNetId = p.ownerNetId ?? 1;

  if (p.radius > 0) {
    // Area of effect: damage every actor in range, scaled by distance falloff.
    forEachDamageableNear(px, py, pz, p.radius, (target, d) => {
      const t = target.transform!;
      const falloff = Math.max(0.15, 1 - d / p.radius);
      let dx = t.position.x - px;
      let dy = t.position.y - py;
      let dz = t.position.z - pz;
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l;
      dy /= l;
      dz /= l;
      applyHit({
        target,
        weaponId: p.weaponId,
        amount: p.damage * falloff,
        zone: "torso",
        point: { x: t.position.x, y: t.position.y, z: t.position.z },
        normal: { x: dx, y: dy, z: dz },
        dir: { x: dx, y: dy, z: dz },
        impulse: p.impulse * falloff,
        melee: false,
        attackerNetId,
        impactVfx: false,
      });
    });
  } else if (directTarget) {
    applyHit({
      target: directTarget,
      weaponId: p.weaponId,
      amount: p.damage,
      zone: "torso",
      point: { x: px, y: py, z: pz },
      normal: { x: -dirX, y: -dirY, z: -dirZ },
      dir: { x: dirX, y: dirY, z: dirZ },
      impulse: p.impulse,
      melee: false,
      attackerNetId,
      impactVfx: true,
    });
  }

  // Blast marker (vfx subsystem adds the real explosion off the per-target damage events).
  pushImpact({ x: px, y: py, z: pz, nx: 0, ny: 1, nz: 0, surface: "concrete" });
  if (p.radius > 0) sfxExplosion({ x: px, y: py, z: pz });
  world.remove(e);
}

export const projectileSystem: System<W> = {
  name: "combat.projectiles",
  phase: "update",
  order: 1,
  fn: (_w, dt) => {
    const now = performance.now();
    // Snapshot into an array first: detonate() removes entities mid-iteration.
    const list = projectiles.entities;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i]!;
      const p = e.combat_projectile!;
      const t = e.transform!;

      const x0 = t.position.x;
      const y0 = t.position.y;
      const z0 = t.position.z;

      // Integrate velocity (gravity + drag) then position.
      p.vy += p.gravity * dt;
      if (p.drag > 0) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
        p.vz *= k;
      }
      const x1 = x0 + p.vx * dt;
      const y1 = y0 + p.vy * dt;
      const z1 = z0 + p.vz * dt;

      // Swept segment prev→next (anti-tunneling).
      let dx = x1 - x0;
      let dy = y1 - y0;
      let dz = z1 - z0;
      const step = Math.hypot(dx, dy, dz);
      if (step > 1e-4) {
        dx /= step;
        dy /= step;
        dz /= step;
        const owner = ownerEntity(p.ownerNetId);
        const hit = castCombatRay(x0, y0, z0, dx, dy, dz, step, owner);
        if (hit.hitSolid) {
          detonate(e, hit.point.x, hit.point.y, hit.point.z, dx, dy, dz, hit.entity);
          continue;
        }
      }

      // Advance.
      t.position.x = x1;
      t.position.y = y1;
      t.position.z = z1;

      // Ground plane, fuse, or lifetime.
      const age = now - p.bornAt;
      if (y1 <= 0.05) {
        detonate(e, x1, 0.02, z1, dx, dy, dz, null);
      } else if (p.fuseMs > 0 && age >= p.fuseMs) {
        detonate(e, x1, y1, z1, dx, dy, dz, null);
      } else if (age >= PROJECTILE_MAX_LIFE_MS) {
        detonate(e, x1, y1, z1, dx, dy, dz, null);
      }
    }
  },
};

/** Resolve the owning entity (to exclude it from its own projectile's sweep). */
function ownerEntity(netId?: number): ClientEntity | null {
  if (netId === undefined) return null;
  for (const e of playersQuery) {
    if (e.netId === netId) return e;
  }
  return null;
}
