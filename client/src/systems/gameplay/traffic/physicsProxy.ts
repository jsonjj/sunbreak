// Near-car physics proxy. Cars within LOD0/LOD1 get a pooled Rapier *kinematic* body (so they're
// solid to the player + world but car↔car spacing stays pure IDM math). On a hard impact with the
// player we promote the body to *dynamic* for a real spin-out, then recycle it after it settles.
// Everything is driven from the R3F bridge's physics-step hooks; raw bodies are created imperatively
// on the managed Rapier world so we don't hand-mount anything.
import type { RapierContext, RapierRigidBody } from "@react-three/rapier";
import { Layer, groupsFor, interactionGroups } from "@sunbreak/shared";
import { CAR_LEN, CAR_WIDTH, CRASH_CLOSING_MS, CRASH_DIST, NEAR_PHYSICS_MAX } from "./config";
import { trafficEvents } from "./events";
import { playerEntity, state } from "./state";
import { trafficQuery } from "./traffic.components";
import type { TrafficCar } from "./types";

type RapierModule = RapierContext["rapier"];
type RapierWorld = RapierContext["world"];

// Kinematic cars are solid to the player + static world, but NOT to each other (IDM owns spacing).
const KIN_GROUPS = interactionGroups([Layer.VEHICLE], [Layer.PLAYER, Layer.WORLD, Layer.PROP]);
// Promoted wrecks collide with everything a vehicle normally does.
const DYN_GROUPS = groupsFor(Layer.VEHICLE);

const bodyByHandle = new Map<number, RapierRigidBody>();
const freeBodies: RapierRigidBody[] = [];
const releaseQueue: number[] = [];

/** Queue a body handle for release on the next physics step (called from any thread of control). */
export function queueBodyRelease(handle: number): void {
  releaseQueue.push(handle);
}

function park(b: RapierRigidBody): void {
  b.setEnabled(false);
}

function drainReleases(world: RapierWorld): void {
  for (const h of releaseQueue) {
    const b = bodyByHandle.get(h);
    if (b) {
      park(b);
      freeBodies.push(b);
      bodyByHandle.delete(h);
    }
  }
  releaseQueue.length = 0;
}

function attach(
  rapier: RapierModule,
  world: RapierWorld,
  car: TrafficCar,
  x: number,
  y: number,
  z: number,
): void {
  let b = freeBodies.pop();
  if (!b) {
    if (bodyByHandle.size >= NEAR_PHYSICS_MAX) return; // physics budget spent → stay visual-only
    const desc = rapier.RigidBodyDesc.kinematicPositionBased();
    b = world.createRigidBody(desc);
    const cdesc = rapier.ColliderDesc.cuboid(CAR_WIDTH * 0.5, 0.5, CAR_LEN * 0.5)
      .setCollisionGroups(KIN_GROUPS)
      .setFriction(0.8);
    world.createCollider(cdesc, b);
  }
  b.setEnabled(true);
  b.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
  const col = b.collider(0);
  if (col) col.setCollisionGroups(KIN_GROUPS);
  b.setTranslation({ x, y, z }, true);
  car.rbHandle = b.handle;
  bodyByHandle.set(b.handle, b);
}

function detach(car: TrafficCar): void {
  if (car.rbHandle === undefined) return;
  const b = bodyByHandle.get(car.rbHandle);
  if (b) {
    park(b);
    freeBodies.push(b);
    bodyByHandle.delete(car.rbHandle);
  }
  car.rbHandle = undefined;
}

/** BEFORE the physics step: attach/detach near-car bodies and push kinematic targets. */
export function syncNearBodies(ctx: RapierContext): void {
  const { rapier, world } = ctx;
  drainReleases(world);
  for (const e of trafficQuery.entities) {
    const c = e.traffic_car;
    const t = e.transform;
    if (!c || !t || c.dynamic) continue;
    const near = c.lod <= 1;
    if (near && c.rbHandle === undefined) attach(rapier, world, c, t.position.x, t.position.y, t.position.z);
    else if (!near && c.rbHandle !== undefined) detach(c);
    if (c.rbHandle !== undefined) {
      const b = bodyByHandle.get(c.rbHandle);
      if (!b) continue;
      b.setNextKinematicTranslation({ x: t.position.x, y: t.position.y, z: t.position.z });
      b.setNextKinematicRotation({
        x: t.rotation.x,
        y: t.rotation.y,
        z: t.rotation.z,
        w: t.rotation.w,
      });
    }
  }
}

/** AFTER the physics step: detect player impacts (promote to dynamic) + read wrecks back. */
export function postStep(ctx: RapierContext): void {
  detectCrashes(ctx);
  readDynamic(ctx);
}

function detectCrashes(ctx: RapierContext): void {
  const pe = playerEntity();
  if (!pe?.transform) return;
  const px = pe.transform.position.x;
  const pz = pe.transform.position.z;
  const pvx = state.view.pvx;
  const pvz = state.view.pvz;
  const crashD2 = CRASH_DIST * CRASH_DIST;
  for (const e of trafficQuery.entities) {
    const c = e.traffic_car;
    const t = e.transform;
    if (!c || !t || c.dynamic || c.rbHandle === undefined) continue;
    const dx = px - t.position.x;
    const dz = pz - t.position.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > crashD2) continue;
    const d = Math.sqrt(d2) || 1;
    const nx = dx / d;
    const nz = dz / d;
    const vlin = e.velocity!.linear;
    const closing = -((vlin.x - pvx) * nx + (vlin.z - pvz) * nz);
    if (closing > CRASH_CLOSING_MS) {
      promote(ctx, c, nx, nz, closing);
      trafficEvents.emit("crash", { x: t.position.x, z: t.position.z, speed: closing });
      state.providers.reportCrime?.(t.position.x, t.position.z, "vehicle_crash");
    }
  }
}

function promote(
  ctx: RapierContext,
  c: TrafficCar,
  nx: number,
  nz: number,
  closing: number,
): void {
  const b = c.rbHandle !== undefined ? bodyByHandle.get(c.rbHandle) : undefined;
  if (!b) return;
  b.setBodyType(ctx.rapier.RigidBodyType.Dynamic, true);
  const col = b.collider(0);
  if (col) col.setCollisionGroups(DYN_GROUPS);
  const mag = Math.min(closing, 14) * 240;
  b.applyImpulse({ x: -nx * mag, y: 70, z: -nz * mag }, true);
  b.applyTorqueImpulse({ x: 0, y: (state.rng() - 0.5) * 220, z: 0 }, true);
  c.dynamic = true;
  c.state = "wreck";
  c.wreckT = 0;
}

function readDynamic(ctx: RapierContext): void {
  const { world } = ctx;
  for (const e of trafficQuery.entities) {
    const c = e.traffic_car;
    const t = e.transform;
    if (!c || !t || !c.dynamic || c.rbHandle === undefined) continue;
    const b = world.getRigidBody(c.rbHandle);
    if (!b) continue;
    const tr = b.translation();
    const rot = b.rotation();
    t.position.x = tr.x;
    t.position.y = tr.y;
    t.position.z = tr.z;
    t.rotation.x = rot.x;
    t.rotation.y = rot.y;
    t.rotation.z = rot.z;
    t.rotation.w = rot.w;
    c.headingY = Math.atan2(
      2 * (rot.w * rot.y + rot.x * rot.z),
      1 - 2 * (rot.y * rot.y + rot.z * rot.z),
    );
  }
}

/** Tear down all bodies (bridge unmount). */
export function releaseAllBodies(world: RapierWorld): void {
  for (const b of bodyByHandle.values()) world.removeRigidBody(b);
  for (const b of freeBodies) world.removeRigidBody(b);
  bodyByHandle.clear();
  freeBodies.length = 0;
  releaseQueue.length = 0;
  for (const e of trafficQuery.entities) {
    if (e.traffic_car) e.traffic_car.rbHandle = undefined;
  }
}
