// Per-frame systems (render phase). Order matters: DRIVE (sync transform + choose locomotion) runs
// before MIXERS (advance animation) so the freshly-chosen clip is what gets sampled this frame.
//
// We only ever touch entities WE own (they carry char_kind + a view component), so we never
// double-tick another subsystem's mixer.

import * as THREE from "three";
import type { System } from "@sunbreak/shared";
import "../char.components";
import type { ClientEntity } from "@/ecs/clientEntity";
import { world } from "@/ecs/world";
import { getCharacterInstance } from "./spawn";

type W = typeof world;

const renderable = world.with("three", "char_kind");
const animated = world.with("mixer", "char_kind");

const _quat = new THREE.Quaternion();

/** Sync each character model to its entity's transform/movement and pick its locomotion state. */
export const charDriveSystem: System<W> = {
  name: "char/drive",
  phase: "render",
  order: 0,
  fn: () => {
    for (const e of renderable.entities) {
      const obj = e.three;
      const t = e.transform;
      if (t) {
        obj.position.set(t.position.x, t.position.y + (e.char_yOffset ?? 0), t.position.z);
      }
      if (e.movement) {
        obj.rotation.set(0, e.movement.facing, 0);
      } else if (e.char_faceYaw !== undefined) {
        obj.rotation.set(0, e.char_faceYaw, 0);
      } else if (t) {
        _quat.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
        obj.quaternion.copy(_quat);
      }

      const inst = getCharacterInstance(e as ClientEntity);
      if (inst && e.movement) {
        inst.setLocomotion(e.movement.normalizedSpeed, e.movement.grounded, e.movement.mode);
      }
    }
  },
};

/** Advance every character mixer. */
export const charMixerSystem: System<W> = {
  name: "char/mixers",
  phase: "render",
  order: 10,
  fn: (_w, dt) => {
    for (const e of animated.entities) {
      e.mixer.update(dt);
    }
  },
};

export const characterSystems: ReadonlyArray<System<W>> = [charDriveSystem, charMixerSystem];
