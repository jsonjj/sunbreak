// 1-D locomotion blend solver. Pure + allocation-free: results are written into a caller-owned
// weights object so the per-frame path never allocates.

import type { Gait, GaitNode } from "./types";

export interface GaitWeights {
  idle: number;
  walk: number;
  run: number;
  sprint: number;
}

export const zeroWeights = (): GaitWeights => ({ idle: 0, walk: 0, run: 0, sprint: 0 });

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Piecewise-linear blend across the (ascending-position) gait nodes for a normalized speed in
 * [0..1]. Writes effective weights into `out` and returns the dominant gait. Weights sum to 1.
 */
export function solveLocomotion1D(
  normalizedSpeed: number,
  nodes: readonly GaitNode[],
  out: GaitWeights,
): Gait {
  out.idle = 0;
  out.walk = 0;
  out.run = 0;
  out.sprint = 0;

  const len = nodes.length;
  if (len === 0) return "idle";

  const n = clamp01(normalizedSpeed);
  const first = nodes[0]!;
  if (n <= first.pos) {
    out[first.gait] = 1;
    return first.gait;
  }
  const last = nodes[len - 1]!;
  if (n >= last.pos) {
    out[last.gait] = 1;
    return last.gait;
  }

  for (let i = 0; i < len - 1; i++) {
    const a = nodes[i]!;
    const b = nodes[i + 1]!;
    if (n >= a.pos && n <= b.pos) {
      const span = b.pos - a.pos;
      const t = span > 1e-6 ? (n - a.pos) / span : 0;
      out[a.gait] = 1 - t;
      out[b.gait] = t;
      return t < 0.5 ? a.gait : b.gait;
    }
  }

  out[last.gait] = 1;
  return last.gait;
}

/**
 * Clip playback rate so the animation cadence matches ground speed (kills foot slide). Idle
 * (nominalSpeed 0) always plays at 1×; moving gaits are clamped to the config range.
 */
export function timeScaleFor(
  speed: number,
  nominalSpeed: number,
  min: number,
  max: number,
): number {
  if (nominalSpeed <= 1e-4) return 1;
  const ts = speed / nominalSpeed;
  return ts < min ? min : ts > max ? max : ts;
}

/** Framerate-independent exponential damp (matches THREE.MathUtils.damp semantics). */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}
