// Per-character locomotion driver: binds shared clips to one AnimationMixer, keeps the base
// gaits co-playing, and every frame maps a LocomotionSample → damped blend weights + speed-synced
// timeScales. In-place policy: clips never move the root; the Rapier capsule owns world position.
//
// This object holds the only live THREE.AnimationAction refs; it is kept in the driver store's
// WeakMap (never on the ECS entity) so sim components stay serializable POJOs.

import { LoopRepeat } from "three";
import type { AnimationAction, AnimationMixer } from "three";
import { DEFAULT_GAIT_NODES } from "./constants";
import { getClipSet, type ClipSet } from "./clipRegistry";
import {
  damp,
  solveLocomotion1D,
  timeScaleFor,
  zeroWeights,
  type GaitWeights,
} from "./blendTree";
import type { AnimLocomotionConfig, AnimLocomotionReadout, Gait, GaitNode, LocomotionSample } from "./types";

export class LocomotionController {
  private readonly mixer: AnimationMixer;
  private readonly config: AnimLocomotionConfig;
  private readonly nodes: readonly GaitNode[] = DEFAULT_GAIT_NODES;
  private readonly actions: Partial<Record<Gait, AnimationAction>> = {};
  private readonly current: GaitWeights = zeroWeights();
  private readonly target: GaitWeights = zeroWeights();
  private boundSet: ClipSet | null = null;
  private dominant: Gait = "idle";

  constructor(mixer: AnimationMixer, config: AnimLocomotionConfig) {
    this.mixer = mixer;
    this.config = config;
    this.current.idle = 1; // start on idle so drei never flashes the bind (T) pose
    this.bind(getClipSet(config.clipSet));
  }

  /** True once at least the idle base action is bound. */
  get bound(): boolean {
    return this.actions.idle != null;
  }

  /** (Re)bind all gait actions from a clip set. Safe to call when the set is swapped at runtime. */
  private bind(set: ClipSet): void {
    for (const gait of Object.keys(this.actions) as Gait[]) {
      this.actions[gait]?.stop();
      delete this.actions[gait];
    }
    for (const node of this.nodes) {
      const clip = set.byKey.get(node.clip);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
      action.setEffectiveTimeScale(1);
      action.setEffectiveWeight(this.current[node.gait]);
      action.play();
      this.actions[node.gait] = action;
    }
    this.boundSet = set;
  }

  /**
   * Advance the blend for one (LOD-scaled) step. Does NOT call `mixer.update` — the batching
   * system owns that so it can throttle the mixer tick by crowd LOD.
   */
  update(dt: number, sample: LocomotionSample): void {
    const set = getClipSet(this.config.clipSet);
    if (set !== this.boundSet) this.bind(set);

    this.dominant = solveLocomotion1D(sample.normalizedSpeed, this.nodes, this.target);

    const { weightDamp, timeScaleSync, minTimeScale, maxTimeScale } = this.config;
    for (const node of this.nodes) {
      const action = this.actions[node.gait];
      const w = damp(this.current[node.gait], this.target[node.gait], weightDamp, dt);
      this.current[node.gait] = w;
      if (!action) continue;
      action.setEffectiveWeight(w);
      // Sync cadence to ground speed only while grounded (no ground reference mid-air).
      const ts =
        timeScaleSync && sample.grounded
          ? timeScaleFor(sample.speed, node.nominalSpeed, minTimeScale, maxTimeScale)
          : 1;
      action.setEffectiveTimeScale(ts);
    }
  }

  /** Copy the compact blend state into the entity's `anim_state` readout (no allocation). */
  writeReadout(out: AnimLocomotionReadout, sample: LocomotionSample): void {
    out.gait = this.dominant;
    out.speed = sample.speed;
    out.normalizedSpeed = sample.normalizedSpeed;
    out.grounded = sample.grounded;
    out.weights.idle = this.current.idle;
    out.weights.walk = this.current.walk;
    out.weights.run = this.current.run;
    out.weights.sprint = this.current.sprint;
    out.bound = this.bound;
  }

  dispose(): void {
    for (const gait of Object.keys(this.actions) as Gait[]) {
      this.actions[gait]?.stop();
      delete this.actions[gait];
    }
    this.boundSet = null;
  }
}
