// Footsteps + jump/land foley, derived from the shared `movement` component (no event wiring
// needed). Cadence is speed/mode-based; the surface comes from the `sfx_surface` component
// (defaults to concrete). Works for the player today and any ped that gains `movement` later.

import type { LocomotionMode, System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { playEvent } from "../dispatch";
import type { SfxSurface } from "../types";
import type { SoundEventId } from "../catalog";

const movers = world.with("movement", "transform");

interface StepState {
  clock: number;
  wasGrounded: boolean;
}
const state = new WeakMap<ClientEntity, StepState>();

const FOOTSTEP: Record<SfxSurface, SoundEventId> = {
  concrete: "footstep_concrete",
  grass: "footstep_grass",
  metal: "footstep_metal",
  wood: "footstep_wood",
  sand: "footstep_sand",
  water: "footstep_water",
  gravel: "footstep_gravel",
  dirt: "footstep_dirt",
};

const STEP_INTERVAL: Partial<Record<LocomotionMode, number>> = {
  walk: 0.5,
  run: 0.34,
  sprint: 0.28,
  crouch: 0.68,
};
const STEP_GAIN: Partial<Record<LocomotionMode, number>> = {
  walk: 0.6,
  run: 0.85,
  sprint: 1.0,
  crouch: 0.4,
};

export const footstepSystem: System<typeof world> = {
  name: "sfx.footsteps",
  phase: "update",
  order: 10,
  fn: (_w, dt) => {
    const d = Math.min(dt, 0.1); // clamp big frames (tab refocus) to avoid step spam
    for (const e of movers.entities) {
      if (e.sfx_muted) continue;
      const m = e.movement;
      if (!m) continue;

      let s = state.get(e);
      if (!s) {
        s = { clock: 999, wasGrounded: m.grounded };
        state.set(e, s);
      }

      // Jump / land transitions.
      if (s.wasGrounded && !m.grounded) {
        if (m.mode === "jump") playEvent("jump", { position: e.transform?.position });
      } else if (!s.wasGrounded && m.grounded) {
        playEvent("land", {
          position: e.transform?.position,
          gain: 0.6 + Math.min(1, m.normalizedSpeed) * 0.4,
        });
        s.clock = 999; // re-arm a step right after landing
      }
      s.wasGrounded = m.grounded;

      // Footstep cadence.
      const interval = STEP_INTERVAL[m.mode];
      const moving = m.grounded && m.speed > 0.4 && interval != null;
      if (!moving) {
        s.clock = interval ?? 0.5; // arm so movement triggers an immediate first step
        continue;
      }
      s.clock += d;
      if (s.clock >= interval) {
        s.clock = 0;
        const surface: SfxSurface = e.sfx_surface ?? "concrete";
        playEvent(FOOTSTEP[surface], {
          position: e.transform?.position,
          gain: STEP_GAIN[m.mode] ?? 0.6,
        });
      }
    }
  },
};
