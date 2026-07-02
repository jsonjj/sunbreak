// Density LOD + adaptive governor.
//
// Each tick we retier every ped by distance to the view focus (camera if present, else player),
// which decides sim fidelity (via `pedShouldTick`/`pedMovable`) and, in render, is used implicitly
// through the FSM. A rolling frame-time governor raises/lowers the active-ped cap with hysteresis
// so we hold framerate on weaker machines.

import { useSettingsStore } from "@/stores/settings.store";
import {
  densityFor,
  FRAME_BUDGET_S,
  GOVERNOR_COOLDOWN_S,
  GOVERNOR_EMA,
  GOVERNOR_MIN_CAP,
  GOVERNOR_STEP,
  LOD_TIERS,
  TICK_BUCKETS,
} from "./config";
import { focusPoint } from "./queries";
import { pedQuery } from "./queries";
import type { PedAgent } from "./types";

// Precompute squared tier bounds.
const TIER_MAX2 = LOD_TIERS.map((t) =>
  t.maxDist === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : t.maxDist * t.maxDist,
);

let frame = 0;
let emaDt = 1 / 60;
let cooldown = 0;
let cap = 0; // governor-limited active cap (0 = uninitialised → set to quality density)

const focus = { x: 0, y: 0, z: 0 };

/** Current quality density target (before governor). */
function qualityDensity(): number {
  return densityFor(useSettingsStore.getState().graphics.quality);
}

/** The active-ped cap the spawner should target this tick. */
export function currentCap(): number {
  const q = qualityDensity();
  if (cap === 0) cap = q;
  return Math.max(GOVERNOR_MIN_CAP, Math.min(q, cap));
}

/** Random round-robin bucket for a freshly spawned ped (temporal spreading of far ticks). */
export function assignTickPhase(a: PedAgent, rng: () => number): void {
  a.tickPhase = (rng() * TICK_BUCKETS) | 0;
}

/** Whether a ped's behaviour FSM should step this frame (far tiers are round-robined). */
export function pedShouldTick(a: PedAgent): boolean {
  const te = LOD_TIERS[a.lod]!.tickEvery;
  if (te <= 1) return true;
  return (frame + a.tickPhase) % te === 0;
}

/** Whether a ped should integrate movement this frame (cull tier freezes). */
export function pedMovable(a: PedAgent): boolean {
  return a.lod <= 2;
}

/** Retier all peds + advance the frame counter + run the governor. */
export function tickLod(dt: number): void {
  frame++;
  focusPoint(focus);

  for (const e of pedQuery) {
    const a = e.ped_agent!;
    if (a.state === "dead") continue;
    const t = e.transform!;
    const dx = t.position.x - focus.x;
    const dz = t.position.z - focus.z;
    const d2 = dx * dx + dz * dz;
    a.dist2 = d2;
    let tier = LOD_TIERS.length - 1;
    for (let i = 0; i < TIER_MAX2.length; i++) {
      if (d2 <= TIER_MAX2[i]!) {
        tier = i;
        break;
      }
    }
    a.lod = tier as PedAgent["lod"];
  }

  // Adaptive governor (frame-time EMA + hysteresis).
  emaDt += GOVERNOR_EMA * (dt - emaDt);
  cooldown -= dt;
  if (cooldown <= 0) {
    const q = qualityDensity();
    if (cap === 0) cap = q;
    if (emaDt > FRAME_BUDGET_S * 1.15) {
      cap = Math.max(GOVERNOR_MIN_CAP, cap - GOVERNOR_STEP);
      cooldown = GOVERNOR_COOLDOWN_S;
    } else if (emaDt < FRAME_BUDGET_S * 0.85 && cap < q) {
      cap = Math.min(q, cap + GOVERNOR_STEP);
      cooldown = GOVERNOR_COOLDOWN_S;
    }
  }
}

/** Debug/telemetry snapshot. */
export function lodStats(): { frame: number; emaFps: number; cap: number } {
  return { frame, emaFps: 1 / emaDt, cap: currentCap() };
}
