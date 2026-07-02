// Pure time-of-day model — no THREE/React deps, deterministic, allocation-free.
// Same code can run on the (v4) server. Damping/smoothing lives in the director.

import type { Vec3 } from "@sunbreak/shared";

/** One in-game day = 1440 game-minutes (a real 24h clock, sped up). */
export const GAME_MINUTES_PER_DAY = 1440;

/** Canon default: a full day↔night cycle every 24 real minutes. */
export const DAY_LENGTH_REAL_SEC = 1440;

/** Game-minutes advanced per real second (=1 with the canon default → 1 game-min/sec). */
export const DEFAULT_TIME_SCALE = GAME_MINUTES_PER_DAY / DAY_LENGTH_REAL_SEC;

/** Clamp per-frame dt so a tab-out / GC stall can't fast-forward hours in one frame. */
export const MAX_FRAME_DT = 1 / 15; // ~66ms

/** Where a fresh world starts (08:00 — morning). */
export const DEFAULT_START_MINUTES = 8 * 60;

/** Fixed arc tilt so the sun sweeps a believable diagonal rather than dead-vertical. */
const SUN_TILT_Z = -0.35;

/** Wrap any minute value into [0, 1440). */
export function wrapMinutes(m: number): number {
  const w = m % GAME_MINUTES_PER_DAY;
  return w < 0 ? w + GAME_MINUTES_PER_DAY : w;
}

/** Advance the clock by `dtSec` real seconds (dt-clamped, wraps at midnight). */
export function advanceTime(gameMinutes: number, dtSec: number, timeScale = DEFAULT_TIME_SCALE): number {
  const dt = dtSec > MAX_FRAME_DT ? MAX_FRAME_DT : dtSec < 0 ? 0 : dtSec;
  return wrapMinutes(gameMinutes + dt * timeScale);
}

/** Normalized time-of-day, 0..1. */
export function tod01(gameMinutes: number): number {
  return wrapMinutes(gameMinutes) / GAME_MINUTES_PER_DAY;
}

/** Integer hour, 0..23. */
export function hourOf(gameMinutes: number): number {
  return Math.floor(wrapMinutes(gameMinutes) / 60) % 24;
}

/** Integer minute, 0..59. */
export function minuteOf(gameMinutes: number): number {
  return Math.floor(wrapMinutes(gameMinutes) % 60);
}

/**
 * Stylized sun direction for a given normalized time-of-day, written into `out`
 * (unit-ish, world space, +y up). Sunrise ≈ 0.25 (due east, low), noon = 0.5
 * (high), sunset ≈ 0.75 (due west, low), midnight = 0 (below horizon).
 */
export function sunDirection(t01: number, out: Vec3): Vec3 {
  const theta = (t01 - 0.25) * Math.PI * 2; // 0 at sunrise, +π/2 at noon
  const x = Math.cos(theta);
  const y = Math.sin(theta);
  const z = SUN_TILT_Z;
  const len = Math.hypot(x, y, z) || 1;
  out.x = x / len;
  out.y = y / len;
  out.z = z / len;
  return out;
}

/** True once the sun dips below the horizon (small negative bias for civil twilight). */
export function isNightFromSun(sunY: number): boolean {
  return sunY < -0.04;
}

/** "HH:MM" 24h clock string for the HUD. */
export function formatClock(gameMinutes: number): string {
  const h = hourOf(gameMinutes);
  const m = minuteOf(gameMinutes);
  return `${h < 10 ? "0" : ""}${h}:${m < 10 ? "0" : ""}${m}`;
}

export type DayPart = "night" | "dawn" | "day" | "dusk";

/** Coarse phase of day for ambience/HUD theming. */
export function dayPart(t01: number): DayPart {
  if (t01 < 0.22 || t01 >= 0.9) return "night";
  if (t01 < 0.3) return "dawn";
  if (t01 < 0.72) return "day";
  return "dusk";
}
