// Near-player ped colliders — the "car can actually hit a pedestrian" bridge.
//
// Peds are kinematic InstancedMesh agents with NO Rapier bodies, so a vehicle drives straight
// through the crowd. Giving every ped a real collider would be far too many bodies, so we pool a
// small, fixed set of lightweight KINEMATIC SENSOR capsules and bind them to the nearest live peds
// each physics step (the same "physics only when near" pattern traffic uses for its cars).
//
// Sensors are non-blocking (the car plows through smoothly, no wall of pedestrians) but still fire
// intersection events. When a *vehicle* moving above a small speed threshold intersects a bound
// ped, we route it into the existing death path (killPed → isDead + ped_ragdoll) with a knockback
// seeded from the vehicle's velocity, so the ragdoll subsystem launches the corpse. The sensor's
// collision filter is VEHICLE-only, so buildings/other peds/the on-foot player never trigger it,
// and traffic's own kinematic cars (which don't list PED in their filter) don't mow the crowd —
// only the player's dynamic chassis (and promoted traffic wrecks) do.
import { useEffect } from "react";
import {
  CapsuleCollider,
  RigidBody,
  useBeforePhysicsStep,
  type IntersectionEnterPayload,
  type RapierRigidBody,
} from "@react-three/rapier";
import { Layer, interactionGroups } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { PED_HALF_HEIGHT, PED_RADIUS } from "../config";
import { getPlayer, pedQuery } from "../queries";
import { killPed } from "../behavior";
import { raiseThreat } from "../perception";

/** How many peds can carry a collider at once (pooled kinematic sensors). */
const POOL = 28;
/** Only peds within this radius of the player get a collider. */
const ACTIVE_R = 24;
const ACTIVE_R2 = ACTIVE_R * ACTIVE_R;
/** Hysteresis: keep a bound collider until the ped drifts a little past the active ring. */
const RELEASE_R2 = (ACTIVE_R + 6) * (ACTIVE_R + 6);
/** Vehicle speed (m/s) below which a touch is a harmless nudge, not a lethal impact. */
const MIN_KILL_SPEED = 3.5;
/** Where idle (unbound) sensors are parked so they never intersect anything. */
const PARK = { x: 0, y: -1000, z: 0 };
/** Sensor sees ONLY vehicles → no noise from buildings, props, other peds or the on-foot player. */
const PED_SENSOR_GROUPS = interactionGroups([Layer.PED], [Layer.VEHICLE]);
const VEHICLE_BIT = 1 << Layer.VEHICLE;

// ── Pool state (module singleton — the view mounts exactly once in the scene) ─────────────────
const bodies: (RapierRigidBody | null)[] = new Array(POOL).fill(null);
const assigned: (ClientEntity | null)[] = new Array(POOL).fill(null);
const pedSlot = new Map<ClientEntity, number>();

// Preallocated candidate scratch (zero per-frame allocation).
const CAND_CAP = 96;
const candE: (ClientEntity | null)[] = new Array(CAND_CAP).fill(null);
const candD: number[] = new Array(CAND_CAP).fill(0);

function unassign(slot: number): void {
  const e = assigned[slot];
  if (e) pedSlot.delete(e);
  assigned[slot] = null;
  bodies[slot]?.setNextKinematicTranslation(PARK);
}

/** Route a vehicle→ped sensor intersection into damage + knockback + ragdoll. */
function onPedSensorHit(slot: number, payload: IntersectionEnterPayload): void {
  const ped = assigned[slot];
  if (!ped) return;
  const a = ped.ped_agent;
  const t = ped.transform;
  if (!a || !t || a.state === "dead") return;

  const rb = payload.other.rigidBody;
  const col = payload.other.collider;
  if (!rb || !col) return;
  // Only a real vehicle is lethal (membership bits, upper 16 of the interaction groups).
  if (((col.collisionGroups() >>> 16) & VEHICLE_BIT) === 0) return;

  const v = rb.linvel();
  const speed = Math.hypot(v.x, v.y, v.z);
  if (speed < MIN_KILL_SPEED) return; // parked/slow car just brushes past

  const inv = 1 / speed;
  const kb = Math.min(speed, 12); // clamp so a fast car can't launch a corpse into orbit
  const lin = { x: v.x * inv * kb, y: 2.6, z: v.z * inv * kb };
  // Seed a linear velocity so physics/ragdoll's seedVelocity() throws the body along the impact.
  if (ped.velocity) {
    ped.velocity.linear.x = lin.x;
    ped.velocity.linear.y = lin.y;
    ped.velocity.linear.z = lin.z;
  } else {
    world.addComponent(ped, "velocity", { linear: lin, angular: { x: 0, y: 0, z: 0 } });
  }

  killPed(ped, {
    dirX: v.x * inv,
    dirY: 0.35,
    dirZ: v.z * inv,
    impulse: 6 + Math.min(speed, 22) * 0.7,
    point: [t.position.x, t.position.y, t.position.z],
  });
  // The crowd scatters from the carnage.
  raiseThreat("vehicle", t.position.x, t.position.z, { intensity: 1.6, radius: 16 });
}

/** Bind pooled sensors to the nearest live peds and drive their kinematic positions. */
function stepPedColliders(): void {
  const player = getPlayer();
  const px = player?.transform?.position.x ?? 0;
  const pz = player?.transform?.position.z ?? 0;

  // 1) Release slots whose ped died, was recycled, or drifted out of range.
  for (let i = 0; i < POOL; i++) {
    const e = assigned[i];
    if (!e) continue;
    const a = e.ped_agent;
    const t = e.transform;
    if (!a || !t || a.state === "dead" || a.slot < 0) {
      unassign(i);
      continue;
    }
    const dx = t.position.x - px;
    const dz = t.position.z - pz;
    if (dx * dx + dz * dz > RELEASE_R2) unassign(i);
  }

  // 2) Gather nearby, unbound, live peds.
  let candN = 0;
  for (const e of pedQuery) {
    if (candN >= CAND_CAP) break;
    const a = e.ped_agent!;
    if (a.state === "dead" || a.slot < 0 || pedSlot.has(e)) continue;
    const t = e.transform!;
    const dx = t.position.x - px;
    const dz = t.position.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 > ACTIVE_R2) continue;
    candE[candN] = e;
    candD[candN] = d2;
    candN++;
  }

  // 3) Fill each free slot with the nearest remaining candidate.
  for (let i = 0; i < POOL; i++) {
    if (assigned[i]) continue;
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < candN; k++) {
      const ce = candE[k];
      const cd = candD[k];
      if (ce && cd !== undefined && cd < bestD) {
        best = k;
        bestD = cd;
      }
    }
    if (best < 0) break;
    const e = candE[best];
    candE[best] = null;
    if (!e) continue;
    assigned[i] = e;
    pedSlot.set(e, i);
  }

  // 4) Drive every bound sensor to its ped's position (unbound ones stay parked).
  for (let i = 0; i < POOL; i++) {
    const b = bodies[i];
    if (!b) continue;
    const e = assigned[i];
    if (e?.transform) {
      const p = e.transform.position;
      b.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
    }
  }

  // Clear consumed candidate refs so entities can be GC'd if they despawn.
  for (let k = 0; k < candN; k++) candE[k] = null;
}

/** Mount ONCE inside the Rapier <Physics> tree (beside the vehicle/player rigs in Scene.tsx). */
export function PedColliders() {
  useBeforePhysicsStep(stepPedColliders);

  useEffect(() => {
    return () => {
      for (let i = 0; i < POOL; i++) {
        assigned[i] = null;
        bodies[i] = null;
      }
      pedSlot.clear();
    };
  }, []);

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <RigidBody
          key={i}
          ref={(b) => {
            bodies[i] = b;
          }}
          type="kinematicPosition"
          colliders={false}
          position={[PARK.x, PARK.y, PARK.z]}
        >
          <CapsuleCollider
            args={[PED_HALF_HEIGHT, PED_RADIUS]}
            sensor
            collisionGroups={PED_SENSOR_GROUPS}
            onIntersectionEnter={(payload) => onPedSensorHit(i, payload)}
          />
        </RigidBody>
      ))}
    </>
  );
}
