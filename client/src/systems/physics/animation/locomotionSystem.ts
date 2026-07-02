// Batched locomotion system. Runs in the `update` phase (per-frame view driven by fresh sim
// state): for every entity opted in via `anim_locomotion`, it reads the LocomotionState from the
// shared `movement`/`velocity` components, drives the blend tree, and ticks the mixer — with
// crowd LOD throttling. Reuses `entity.mixer` if present, else lazily builds one from `entity.three`.

import * as THREE from "three";
import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { IDLE_SPEED_EPSILON, LOD_INTERVAL, NORMALIZED_SPEED_REF } from "./constants";
import { getOrCreateDriver } from "./driverStore";
import type { AnimLocomotionReadout, LocomotionSample } from "./types";

type W = typeof world;

// Live archetype of every entity that opted into locomotion animation (updates as entities change).
const animated = world.with("anim_locomotion");

// Per-frame scratch — reused across all entities so the hot loop never allocates.
const sample: LocomotionSample = {
  speed: 0,
  normalizedSpeed: 0,
  vx: 0,
  vz: 0,
  grounded: true,
  mode: "idle",
};

/**
 * Fill the sample from the entity. INPUT CONTRACT: prefer the shared `movement` component
 * (speed / normalizedSpeed / grounded / mode); fall back to planar `velocity` when a bare mover
 * (e.g. a simple ped) only publishes velocity.
 */
function readLocomotion(entity: ClientEntity, out: LocomotionSample): void {
  const v = entity.velocity;
  out.vx = v ? v.linear.x : 0;
  out.vz = v ? v.linear.z : 0;

  const m = entity.movement;
  if (m) {
    out.speed = m.speed;
    out.normalizedSpeed = m.normalizedSpeed;
    out.grounded = m.grounded;
    out.mode = m.mode;
  } else {
    const planar = Math.hypot(out.vx, out.vz);
    out.speed = planar;
    out.normalizedSpeed = planar / NORMALIZED_SPEED_REF;
    out.grounded = true;
    out.mode = planar > IDLE_SPEED_EPSILON ? "run" : "idle";
  }

  out.normalizedSpeed = out.normalizedSpeed < 0 ? 0 : out.normalizedSpeed > 1 ? 1 : out.normalizedSpeed;
}

/** Reuse the entity's mixer, or create one from its rigged `three` object. Null if neither exists. */
function ensureMixer(entity: ClientEntity): { mixer: THREE.AnimationMixer; owns: boolean } | null {
  if (entity.mixer) return { mixer: entity.mixer, owns: false };
  const root = entity.three;
  if (!root) return null;
  const mixer = new THREE.AnimationMixer(root);
  world.addComponent(entity, "mixer", mixer);
  return { mixer, owns: true };
}

const DEFAULT_READOUT = (): AnimLocomotionReadout => ({
  gait: "idle",
  speed: 0,
  normalizedSpeed: 0,
  grounded: false,
  weights: { idle: 0, walk: 0, run: 0, sprint: 0 },
  bound: false,
});

function ensureReadout(entity: ClientEntity): AnimLocomotionReadout {
  const existing = entity.anim_state;
  if (existing) return existing;
  const created = DEFAULT_READOUT();
  world.addComponent(entity, "anim_state", created);
  return created;
}

export const locomotionSystem: System<W> = {
  name: "anim/locomotion",
  phase: "update",
  // After gameplay/movement writers within the frame; keep well below render-side systems.
  order: 20,
  fn: (_world, dt) => {
    const list = animated.entities;
    for (let i = 0; i < list.length; i++) {
      const entity = list[i];
      if (!entity) continue;

      const mixerInfo = ensureMixer(entity);
      if (!mixerInfo) continue; // no rig mounted yet — driven once `three`/`mixer` appears

      const record = getOrCreateDriver(entity, mixerInfo.mixer, mixerInfo.owns);

      const tier = entity.anim_lod ?? 0;
      const interval = LOD_INTERVAL[tier] ?? 0;
      if (interval === Number.POSITIVE_INFINITY) continue; // frozen (off-screen / far)

      record.lodAccum += dt;
      if (record.lodAccum < interval) continue; // throttled this frame
      const step = record.lodAccum;
      record.lodAccum = 0;

      readLocomotion(entity, sample);
      record.controller.update(step, sample);
      record.mixer.update(step);
      record.controller.writeReadout(ensureReadout(entity), sample);
    }
  },
};
