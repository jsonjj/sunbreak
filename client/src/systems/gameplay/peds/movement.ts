// Kinematic ped movement (NON-Rapier). Peds steer toward their current waypoint with local
// avoidance (separation from other peds + repulsion from nearby vehicles), integrate a planar
// velocity, and write straight into the shared `transform`. No physics bodies, no colliders.

import {
  ARCHETYPES,
  PED_ACCEL,
  PED_CENTER_Y,
  SEPARATION_R,
  SEPARATION_W,
  VEHICLE_AVOID_R,
  VEHICLE_AVOID_W,
} from "./config";
import { forEachPedNear } from "./spatialHash";
import { pedQuery } from "./queries";
import type { PedAgent, VehicleQuery } from "./types";

// ── Injected vehicle proximity source (traffic subsystem) ───────────────────────────────────
let vehicleQuery: VehicleQuery | null = null;

/** Wire traffic's `getVehiclesNear(x,z,r)` so peds dodge cars. Optional. */
export function setPedVehicleProvider(q: VehicleQuery | null): void {
  vehicleQuery = q;
}

function resolveVehicleQuery(): VehicleQuery | null {
  if (vehicleQuery) return vehicleQuery;
  if (typeof window !== "undefined") {
    const g = (window as unknown as { __SUNBREAK_TRAFFIC__?: { getVehiclesNear?: VehicleQuery } })
      .__SUNBREAK_TRAFFIC__;
    if (g?.getVehiclesNear) return g.getVehiclesNear;
  }
  return null;
}

function desiredSpeed(a: PedAgent): number {
  switch (a.state) {
    case "flee":
      return ARCHETYPES[a.archetype].run;
    case "panic":
      return ARCHETYPES[a.archetype].run * 1.12;
    case "idle":
    case "cower":
    case "dead":
      return 0;
    default:
      return a.maxSpeed;
  }
}

/**
 * Integrate one movement step. `movable(a)` gates by LOD (far/cull peds tick less). Separation +
 * vehicle avoidance run only for near peds (`avoid`) to bound cost.
 */
export function tickMovement(dt: number, movable: (a: PedAgent) => boolean): void {
  const vq = resolveVehicleQuery();

  for (const e of pedQuery) {
    const a = e.ped_agent!;
    if (a.state === "dead" || !movable(a)) continue;
    const t = e.transform!;
    const x = t.position.x;
    const z = t.position.z;

    const spd = desiredSpeed(a);
    let desVx = 0;
    let desVz = 0;

    // Seek current waypoint.
    if (spd > 0 && a.target >= 0) {
      const dx = a.destX - x;
      const dz = a.destZ - z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-3) {
        desVx = (dx / d) * spd;
        desVz = (dz / d) * spd;
      }
    }

    // Local avoidance for near peds only.
    if (a.lod <= 1) {
      let sepX = 0;
      let sepZ = 0;
      forEachPedNear(
        x,
        z,
        SEPARATION_R,
        (other, d2) => {
          const oa = other.ped_agent!;
          if (oa.state === "dead") return;
          const ot = other.transform!;
          const dx = x - ot.position.x;
          const dz = z - ot.position.z;
          const d = Math.sqrt(d2) || 1e-3;
          const w = (SEPARATION_R - d) / SEPARATION_R; // stronger when closer
          sepX += (dx / d) * w;
          sepZ += (dz / d) * w;
        },
        e,
      );
      desVx += sepX * SEPARATION_W * spd;
      desVz += sepZ * SEPARATION_W * spd;

      // Vehicle repulsion (dodge cars).
      if (vq) {
        const cars = vq(x, z, VEHICLE_AVOID_R);
        for (let i = 0; i < cars.length; i++) {
          const c = cars[i]!;
          const dx = x - c.x;
          const dz = z - c.z;
          const d = Math.hypot(dx, dz) || 1e-3;
          const rad = (c.radius ?? 2) + VEHICLE_AVOID_R;
          if (d >= rad) continue;
          const w = (rad - d) / rad;
          desVx += (dx / d) * w * VEHICLE_AVOID_W * ARCHETYPES[a.archetype].run;
          desVz += (dz / d) * w * VEHICLE_AVOID_W * ARCHETYPES[a.archetype].run;
        }
      }
    }

    // Clamp desired velocity to the target speed envelope (avoidance can overshoot).
    const desLen = Math.hypot(desVx, desVz);
    const cap = spd > 0 ? spd * 1.35 : 0;
    if (desLen > cap && desLen > 1e-3) {
      const s = cap / desLen;
      desVx *= s;
      desVz *= s;
    }

    // Approach desired velocity with bounded acceleration.
    const maxDelta = PED_ACCEL * dt;
    let dvx = desVx - a.vx;
    let dvz = desVz - a.vz;
    const dlen = Math.hypot(dvx, dvz);
    if (dlen > maxDelta && dlen > 1e-3) {
      const s = maxDelta / dlen;
      dvx *= s;
      dvz *= s;
    }
    a.vx += dvx;
    a.vz += dvz;

    a.speed = Math.hypot(a.vx, a.vz);
    if (a.speed < 0.02) {
      a.vx = 0;
      a.vz = 0;
      a.speed = 0;
    }

    // Integrate + write transform.
    t.position.x = x + a.vx * dt;
    t.position.z = z + a.vz * dt;
    t.position.y = PED_CENTER_Y;

    // Facing + walk-cycle phase (procedural anim driver).
    if (a.speed > 0.05) a.heading = Math.atan2(a.vx, a.vz);
    a.animPhase = (a.animPhase + a.speed * dt * 0.9) % 1;
    a.age += dt;
  }
}
