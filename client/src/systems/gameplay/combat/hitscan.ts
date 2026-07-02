// Hitscan resolution. Two layers, combined into the nearest hit along the ray:
//   1. Rapier raycast for SOLID geometry (walls/props/ground) → blocking distance. Excludes the
//      shooter's own body. Only available once <CombatRig/> has published the Rapier world.
//   2. Analytic ray-vs-capsule against every damageable actor (`stat_health` + `transform`).
//      Peds are KINEMATIC and have NO Rapier colliders (per the peds subsystem), so this analytic
//      pass is how we register hits on them — and on combat's own practice targets, and any future
//      `stat_health` actor. Works even when the rig isn't mounted (no world occlusion then).

import type { Vec3 } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { Hitzone } from "./types";
import { combatRuntime, shooterBody } from "./runtime";
import type { RapierNamespace } from "./runtime";
import { HEAD_BAND, HITBOX_HALF_HEIGHT, HITBOX_RADIUS, LIMB_BAND } from "./constants";

/** All damageable actors: canonical vitals + a world transform, still alive. */
const damageable = world.with("stat_health", "transform").without("isDead");

export interface CombatRayHit {
  /** The actor struck, or null when the ray only hit solid geometry (or nothing). */
  entity: ClientEntity | null;
  point: Vec3;
  normal: Vec3;
  /** Distance from the ray origin to the impact (m). */
  distance: number;
  zone: Hitzone;
  /** True when the ray hit an actor OR solid geometry (i.e. spawn an impact decal). */
  hitSolid: boolean;
}

// Reused Rapier ray (created lazily once the namespace is available).
let ray: InstanceType<RapierNamespace["Ray"]> | null = null;

/** Rapier raycast distance to the nearest solid collider (excludes the shooter). `maxDist` if none. */
function worldBlockingDistance(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
): number {
  const { world: rWorld, rapier } = combatRuntime;
  if (!rWorld || !rapier) return maxDist;
  if (!ray) ray = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  ray.origin.x = ox;
  ray.origin.y = oy;
  ray.origin.z = oz;
  ray.dir.x = dx;
  ray.dir.y = dy;
  ray.dir.z = dz;
  const body = shooterBody();
  const hit = rWorld.castRay(ray, maxDist, true, undefined, undefined, undefined, body ?? undefined);
  return hit ? Math.min(maxDist, hit.timeOfImpact) : maxDist;
}

// Closest approach between the ray segment [o, o+d*maxDist] and the capsule axis [a, b].
// Returns the ray parameter (0..maxDist), the axis parameter (0..1), and the gap distance.
const _seg = { tRay: 0, tAxis: 0, dist: Infinity };
function raySegClosest(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): { tRay: number; tAxis: number; dist: number } {
  // d1 = ray dir * maxDist, d2 = axis
  const d1x = dx * maxDist;
  const d1y = dy * maxDist;
  const d1z = dz * maxDist;
  const d2x = bx - ax;
  const d2y = by - ay;
  const d2z = bz - az;
  const rx = ox - ax;
  const ry = oy - ay;
  const rz = oz - az;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  const EPS = 1e-8;
  let s = 0;
  let t = 0;
  if (a <= EPS && e <= EPS) {
    s = 0;
    t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= EPS) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b2 = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b2 * b2;
      s = denom > EPS ? clamp01((b2 * f - c * e) / denom) : 0;
      t = (b2 * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b2 - c) / a);
      }
    }
  }
  const c1x = ox + d1x * s;
  const c1y = oy + d1y * s;
  const c1z = oz + d1z * s;
  const c2x = ax + d2x * t;
  const c2y = ay + d2y * t;
  const c2z = az + d2z * t;
  const gx = c1x - c2x;
  const gy = c1y - c2y;
  const gz = c1z - c2z;
  _seg.tRay = s * maxDist;
  _seg.tAxis = t;
  _seg.dist = Math.sqrt(gx * gx + gy * gy + gz * gz);
  return _seg;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function zoneFor(tAxis: number): Hitzone {
  if (tAxis >= HEAD_BAND) return "head";
  if (tAxis <= LIMB_BAND) return "limb";
  return "torso";
}

/**
 * Cast a shot. `origin`/`dir` (dir must be unit) in world space; `maxDist` = weapon range;
 * `shooter` is excluded from actor hits. Returns the nearest actor hit, else the wall hit, else a
 * "nothing" result whose `point` is the ray's far end (for tracer rendering).
 */
export function castCombatRay(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  shooter: ClientEntity | null,
): CombatRayHit {
  const wallDist = worldBlockingDistance(ox, oy, oz, dx, dy, dz, maxDist);

  let hitEntity: ClientEntity | null = null;
  let hitDist = wallDist; // only accept actors closer than the wall
  let hitZone: Hitzone = "torso";

  for (const e of damageable) {
    if (e === shooter) continue;
    const t = e.transform!;
    const cx = t.position.x;
    const cy = t.position.y;
    const cz = t.position.z;
    const seg = raySegClosest(
      ox,
      oy,
      oz,
      dx,
      dy,
      dz,
      maxDist,
      cx,
      cy - HITBOX_HALF_HEIGHT,
      cz,
      cx,
      cy + HITBOX_HALF_HEIGHT,
      cz,
    );
    if (seg.dist <= HITBOX_RADIUS && seg.tRay > 0.05 && seg.tRay < hitDist) {
      hitDist = seg.tRay;
      hitEntity = e;
      hitZone = zoneFor(seg.tAxis);
    }
  }

  if (hitEntity) {
    return {
      entity: hitEntity,
      point: { x: ox + dx * hitDist, y: oy + dy * hitDist, z: oz + dz * hitDist },
      normal: { x: -dx, y: -dy, z: -dz },
      distance: hitDist,
      zone: hitZone,
      hitSolid: true,
    };
  }

  const solid = wallDist < maxDist;
  const d = solid ? wallDist : maxDist;
  return {
    entity: null,
    point: { x: ox + dx * d, y: oy + dy * d, z: oz + dz * d },
    normal: { x: -dx, y: -dy, z: -dz },
    distance: d,
    zone: "torso",
    hitSolid: solid,
  };
}

/** Nearest damageable actor to a world point within radius (for AoE + melee), excluding `skip`. */
export function forEachDamageableNear(
  x: number,
  y: number,
  z: number,
  r: number,
  cb: (e: ClientEntity, dist: number) => void,
  skip?: ClientEntity | null,
): void {
  const r2 = r * r;
  for (const e of damageable) {
    if (e === skip) continue;
    const t = e.transform!;
    const dx = t.position.x - x;
    const dy = t.position.y - y;
    const dz = t.position.z - z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 <= r2) cb(e, Math.sqrt(d2));
  }
}
