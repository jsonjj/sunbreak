// Pure solar geometry. No allocation in the hot path: callers pass an `out` vector to reuse.
// Artistic arc (not a real ephemeris) — good enough for a game sky and cheap to compute.
import { MathUtils, Vector3 } from "three";

/**
 * Direction toward the sun for a given hour, as a unit vector.
 * 6h → sunrise at the east horizon, 12h → overhead, 0/24h → below the horizon (midnight).
 * A small constant Z tilt keeps the arc off the camera's exact axis.
 */
export function sunPositionFromHour(hour: number, out: Vector3): Vector3 {
  const phi = ((hour - 6) / 24) * Math.PI * 2;
  return out.set(Math.cos(phi), Math.sin(phi), 0.28).normalize();
}

/** 0 (night) … 1 (day), smoothstepped across the horizon band of the sun's elevation. */
export function dayAmountFromSunY(sunY: number): number {
  return MathUtils.smoothstep(sunY, -0.12, 0.22);
}

/** Wrap an hour value into [0, 24). */
export function wrapHour(hour: number): number {
  const h = hour % 24;
  return h < 0 ? h + 24 : h;
}
