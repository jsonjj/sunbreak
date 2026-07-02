// physics/animation — reusable locomotion blend-tree / mixer driver.
//
// Mixamo clips on a shared humanoid rig, driven by THREE.AnimationMixer. A single batched system
// consumes each entity's LocomotionState (shared `movement`/`velocity` components) and drives its
// `mixer` view component through a 1-D idle→walk→run→sprint blend with speed-synced timeScales and
// crowd LOD throttling. The same driver serves the player and every ped.
//
// Integrate an entity in two steps (from the rig-mounting subsystem — NOT hand-mounted here):
//   1. put the rigged humanoid on `entity.three` (or set `entity.mixer` yourself), and
//   2. call `attachLocomotion(entity)`.
// Real clip packs (when present) are injected once via `registerLocomotionClips(clips)`; until
// then a free procedural fallback set keeps the driver fully functional.

import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import "./anim.components"; // ECS declaration-merge augmentation (side-effect module)
import { locomotionSystem } from "./locomotionSystem";

type W = typeof world;

export const anim: SubsystemModule<W> = {
  id: "physics/animation",
  systems: [locomotionSystem],
};

registerModule(anim); // required self-registration side effect

// ── Public API ──────────────────────────────────────────────────────────────────────────────
// Driver lifecycle + reuse helpers (player / peds / character-content call these).
export {
  attachLocomotion,
  detachLocomotion,
  createCharacterAnimation,
  cloneRig,
  getDriver,
} from "./driverStore";

// Clip registry (asset pipeline / character-content inject real Mixamo packs here).
export {
  registerLocomotionClips,
  getClipSet,
  getClip,
  hasRealClips,
  assertInPlace,
  resetClipRegistry,
} from "./clipRegistry";

// Blend-tree + layering utilities (combat aim-while-move, v1/v2 state overlays).
export { solveLocomotion1D, timeScaleFor, damp, zeroWeights } from "./blendTree";
export { crossfade, fadeIn, fadeOut, playOneShot } from "./crossfade";
export { maskUpper, maskLower, additiveUpperOffset } from "./layers";
export { LocomotionController } from "./locomotionController";
export { DEFAULT_GAIT_NODES, DEFAULT_LOCOMOTION_CONFIG, CLIP } from "./constants";

export type { GaitWeights } from "./blendTree";
export type { ClipSet, RegisterOptions } from "./clipRegistry";
export type { DriverRecord } from "./driverStore";
export type {
  Gait,
  GaitNode,
  LocomotionSample,
  AnimLocomotionConfig,
  AnimLocomotionReadout,
  AnimLodTier,
  CharacterAnimation,
} from "./types";
