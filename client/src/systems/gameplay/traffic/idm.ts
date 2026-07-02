// Pure Intelligent Driver Model (Treiber et al.). Longitudinal car-following only — lateral
// placement is the lane graph's job. Deterministic and allocation-free, so it can also run on the
// (v4) headless server. Ported from the plan's sketch with an acceleration clamp to kill ringing.
import { ACCEL_CLAMP } from "./config";
import type { IdmParams } from "./types";

/**
 * @param v    current speed (m/s, >= 0)
 * @param gap  bumper-to-bumper distance to the lead obstacle (m). Infinity/large => free road.
 * @param dv   closing speed = v - vLead (positive when approaching the lead)
 */
export function idmAccel(v: number, gap: number, dv: number, p: IdmParams): number {
  const sStar = p.s0 + Math.max(0, v * p.T + (v * dv) / (2 * Math.sqrt(p.a * p.b)));
  const free = 1 - Math.pow(v / Math.max(0.001, p.v0), p.delta);
  const inter = gap > 1e-3 ? (sStar / gap) * (sStar / gap) : 1e6; // huge brake if no gap
  const a = p.a * (free - inter);
  // Clamp to a sane band so a single frame can't launch or ring the car.
  return a > ACCEL_CLAMP ? ACCEL_CLAMP : a < -ACCEL_CLAMP ? -ACCEL_CLAMP : a;
}

/** Desired dynamic gap s*(v, dv) — handy for spawn spacing + tests. */
export function desiredGap(v: number, dv: number, p: IdmParams): number {
  return p.s0 + Math.max(0, v * p.T + (v * dv) / (2 * Math.sqrt(p.a * p.b)));
}
