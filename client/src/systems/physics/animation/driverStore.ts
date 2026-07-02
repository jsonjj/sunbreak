// Lifecycle + public API for the locomotion driver. The live per-entity controller (holding
// AnimationAction refs) is kept in a WeakMap keyed by entity — NOT on the entity — so the ECS
// only ever carries serializable `anim_*` POJOs plus the shared `mixer` view component.

import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { AnimationAction, Object3D } from "three";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { DEFAULT_LOCOMOTION_CONFIG } from "./constants";
import { getClipSet } from "./clipRegistry";
import { LocomotionController } from "./locomotionController";
import type { AnimLocomotionConfig, CharacterAnimation } from "./types";

export interface DriverRecord {
  controller: LocomotionController;
  mixer: THREE.AnimationMixer;
  /** dt accumulator for LOD tick throttling. */
  lodAccum: number;
  /** True if this subsystem created the mixer (and should tear it down on detach). */
  ownsMixer: boolean;
}

const drivers = new WeakMap<ClientEntity, DriverRecord>();

/** Get (or lazily build) the driver record for an entity bound to a specific mixer. */
export function getOrCreateDriver(
  entity: ClientEntity,
  mixer: THREE.AnimationMixer,
  ownsMixer = false,
): DriverRecord {
  const existing = drivers.get(entity);
  if (existing && existing.mixer === mixer) return existing;
  if (existing) existing.controller.dispose();

  const config: AnimLocomotionConfig = entity.anim_locomotion ?? { ...DEFAULT_LOCOMOTION_CONFIG };
  const record: DriverRecord = {
    controller: new LocomotionController(mixer, config),
    mixer,
    lodAccum: 0,
    ownsMixer,
  };
  drivers.set(entity, record);
  return record;
}

export function getDriver(entity: ClientEntity): DriverRecord | undefined {
  return drivers.get(entity);
}

/** Dispose an entity's driver (and its mixer, if this subsystem created it). */
export function disposeDriver(entity: ClientEntity): void {
  const record = drivers.get(entity);
  if (!record) return;
  record.controller.dispose();
  if (record.ownsMixer) {
    record.mixer.stopAllAction();
    if (entity.mixer === record.mixer) world.removeComponent(entity, "mixer");
  }
  drivers.delete(entity);
}

/**
 * Opt an entity into the locomotion blend-tree driver. Adds/updates the `anim_locomotion`
 * component; the batching system then drives it every frame from the entity's `movement`/
 * `velocity` (reusing `mixer` if present, else creating one from `three`). Returns a detach fn.
 *
 * Usage (player or ped): give the entity a rigged `three` object, then `attachLocomotion(e)`.
 */
export function attachLocomotion(
  entity: ClientEntity,
  config?: Partial<AnimLocomotionConfig>,
): () => void {
  const merged: AnimLocomotionConfig = { ...DEFAULT_LOCOMOTION_CONFIG, ...config };
  if (entity.anim_locomotion) Object.assign(entity.anim_locomotion, merged);
  else world.addComponent(entity, "anim_locomotion", merged);
  return () => detachLocomotion(entity);
}

/** Remove the driver and its `anim_*` components from an entity. */
export function detachLocomotion(entity: ClientEntity): void {
  disposeDriver(entity);
  if (entity.anim_locomotion) world.removeComponent(entity, "anim_locomotion");
  if (entity.anim_state) world.removeComponent(entity, "anim_state");
}

/**
 * Imperative equivalent of drei's `useAnimations(clips, root)` for code paths that can't use a
 * hook (ECS systems, ped clones). Creates a mixer on `root`, binds the shared clip set, and
 * returns `{ mixer, actions, names, clips }`. The caller assigns `entity.mixer = result.mixer`.
 */
export function createCharacterAnimation(
  root: Object3D,
  clipSet = "default",
): CharacterAnimation {
  const mixer = new THREE.AnimationMixer(root);
  const set = getClipSet(clipSet);
  const actions: Partial<Record<string, AnimationAction>> = {};
  const names: string[] = [];
  const clips = [...set.byKey.values()];
  set.byKey.forEach((clip, key) => {
    actions[key] = mixer.clipAction(clip);
    names.push(key);
  });
  return { mixer, actions, names, clips };
}

/**
 * Clone a rigged character (skinned meshes + independent skeleton) for reuse across many peds.
 * Clips stay shared/immutable; only bones + the per-instance mixer are duplicated.
 */
export function cloneRig(source: Object3D): Object3D {
  return cloneSkeleton(source);
}
