// Car lifecycle: build an ambient-car entity (sim + view components), recycle it back to the pools,
// and strip its traffic components for the carjack handoff. Entities are fresh POJOs per spawn
// (cheap); the heavy resources — THREE groups and Rapier bodies — are pooled.
import type * as THREE from "three";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import {
  CAR_CLASSES,
  CAR_Y,
  IDM_AGGRO,
  IDM_BASE,
  IDM_CAUTIOUS,
  L2_TICK_SLICES,
  TOTAL_CAR_WEIGHT,
} from "./config";
import { sampleLane } from "./laneGraph";
import { clamp, scratchA, setYawQuat } from "./math";
import { queueBodyRelease } from "./physicsProxy";
import { randInt, randRange, type Rng } from "./prng";
import { pickSuccessor } from "./route";
import { state } from "./state";
import { trafficQuery } from "./traffic.components";
import type { CarClassDef } from "./config";
import type { IdmParams, Lane, LaneGraph, TrafficCar } from "./types";

function pickClass(rng: Rng): CarClassDef {
  let r = rng() * TOTAL_CAR_WEIGHT;
  for (const c of CAR_CLASSES) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return CAR_CLASSES[0]!;
}

function pickDriver(rng: Rng, v0: number): IdmParams {
  const d = rng();
  const base = d < 0.6 ? IDM_BASE : d < 0.85 ? IDM_CAUTIOUS : IDM_AGGRO;
  return { ...base, v0 };
}

/** Build + register an ambient car entity at arc-length `s` on `lane`. */
export function spawnCarAt(graph: LaneGraph, lane: Lane, s: number): ClientEntity {
  const rng = state.rng;
  const cls = pickClass(rng);
  const color = cls.palette[randInt(rng, 0, cls.palette.length - 1)]!;
  const v0 = clamp(Math.min(lane.speedLimit, cls.topSpeed) * randRange(rng, 0.86, 1.05), 4, 30);
  const heading = sampleLane(lane, s, scratchA);

  const car: TrafficCar = {
    laneId: lane.id,
    s,
    speed: v0 * 0.55,
    nextLane: pickSuccessor(graph, lane, rng),
    desiredSpeed: v0,
    baseSpeed: v0,
    driver: pickDriver(rng, v0),
    vehicleId: cls.vehicleId,
    classId: lane.classId,
    length: cls.length,
    width: cls.width,
    lod: 2,
    state: "cruise",
    colorHex: color,
    headingY: heading,
    lateral: 0,
    targetLateral: 0,
    ignoreSignals: false,
    stuckT: 0,
    wreckT: 0,
    tickPhase: randInt(rng, 0, L2_TICK_SLICES - 1),
  };

  const group = state.acquireGroup(color);
  group.position.set(scratchA.x, CAR_Y, scratchA.z);
  group.rotation.set(0, heading, 0);

  const dirX = Math.sin(heading);
  const dirZ = Math.cos(heading);
  const entity: ClientEntity = {
    transform: {
      position: { x: scratchA.x, y: CAR_Y, z: scratchA.z },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
    velocity: {
      linear: { x: dirX * car.speed, y: 0, z: dirZ * car.speed },
      angular: { x: 0, y: 0, z: 0 },
    },
    three: group,
    traffic_car: car,
    traffic_ambient: true,
    traffic_carjackable: true,
  };
  setYawQuat(entity.transform!.rotation, heading);
  world.add(entity);
  return entity;
}

/** Fully recycle a car: free its THREE group + Rapier body, remove the entity. */
export function recycleCar(entity: ClientEntity): void {
  const car = entity.traffic_car;
  if (car?.rbHandle !== undefined) {
    queueBodyRelease(car.rbHandle);
    car.rbHandle = undefined;
  }
  if (entity.three) state.releaseGroup(entity.three as THREE.Group);
  world.remove(entity);
}

/** Recycle every ambient car (used when the lane graph is rebuilt, e.g. City-Gen loads late). */
export function recycleAllCars(): void {
  const cars = trafficQuery.entities;
  for (let i = cars.length - 1; i >= 0; i--) {
    const e = cars[i];
    if (e) recycleCar(e);
  }
}

/**
 * Remove traffic ownership from an entity WITHOUT destroying it — used by the carjack handoff so the
 * same entity (transform, velocity, THREE model) can be adopted by vehicle-gameplay. Releases the
 * kinematic body (vehicle-physics attaches its own controller), keeps the visual for continuity.
 */
export function stripTrafficComponents(entity: ClientEntity): void {
  const car = entity.traffic_car;
  if (car?.rbHandle !== undefined) {
    queueBodyRelease(car.rbHandle);
    car.rbHandle = undefined;
  }
  if (entity.traffic_car) world.removeComponent(entity, "traffic_car");
  if (entity.traffic_ambient) world.removeComponent(entity, "traffic_ambient");
  if (entity.traffic_carjackable) world.removeComponent(entity, "traffic_carjackable");
}
