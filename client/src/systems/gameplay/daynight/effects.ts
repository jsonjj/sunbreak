// Pure derived gameplay signals — consumed by traffic/ped spawners and vehicle
// physics. No deps; deterministic; supports writing IN PLACE into a reused object.

import type { EnvSnapshot, EnvEffects } from "./types";

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// --- wet-road grip tuning (exported so vehicle physics can align) ---
export const MIN_ROAD_GRIP = 0.5;
export const WETNESS_GRIP_FALLOFF = 0.45;
export const WETNESS_SIDE_FALLOFF = 0.35;
export const MIN_SIDE_FRICTION_SCALE = 0.6;

// --- wetness accumulator tuning (per real second) ---
export const WETNESS_RISE = 0.09; // at full rain
export const WETNESS_DRY = 0.04; // when dry (slower than it rises)

/** Time-of-day population curve: deep-night low, dawn ramp, midday plateau, dusk taper. */
function dayCurve(t01: number): number {
  if (t01 < 0.22 || t01 > 0.9) return 0.4; // night
  if (t01 < 0.3) return 0.4 + ((t01 - 0.22) / 0.08) * 0.55; // dawn ramp → ~0.95
  if (t01 > 0.78) return 0.95 - ((t01 - 0.78) / 0.12) * 0.5; // dusk taper → ~0.45
  return 1; // daytime plateau
}

/**
 * Derive all gameplay multipliers/flags from the environment snapshot. If `out` is
 * provided it is mutated and returned (allocation-free per frame); otherwise a new
 * object is allocated.
 */
export function deriveEffects(e: EnvSnapshot, out?: EnvEffects): EnvEffects {
  const curve = dayCurve(e.tod01);
  const isHurricane = e.weather === "hurricane" ? 1 : 0;
  const stormPenalty = clamp(1 - 0.6 * e.rain - 0.9 * isHurricane, 0.05, 1);

  const target: EnvEffects = out ?? ({} as EnvEffects);
  target.trafficDensity = clamp(curve * stormPenalty, 0.05, 1);
  target.pedDensity = clamp(curve * stormPenalty * (1 - 0.3 * e.rain), 0.02, 1);
  target.roadGrip = clamp(1 - WETNESS_GRIP_FALLOFF * e.wetness, MIN_ROAD_GRIP, 1);
  target.sideFrictionScale = clamp(1 - WETNESS_SIDE_FALLOFF * e.wetness, MIN_SIDE_FRICTION_SCALE, 1);
  target.visibilityFog = e.fog;
  target.hydroplaneRisk = e.wetness > 0.8 && e.rain > 0.6;
  target.curfew = e.weather === "hurricane";
  return target;
}
