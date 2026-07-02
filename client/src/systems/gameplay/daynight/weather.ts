// Pure weather model — seeded, weighted Markov FSM + per-state target params.
// Deterministic (single integer seed) so single-player and (v4) multiplayer evolve
// identically without lockstep chatter.

import type { WeatherKind } from "./types";

/** Continuous target params each weather state damps toward. */
export interface WeatherTarget {
  cloud: number; // 0..1
  rain: number; // 0..1
  fog: number; // 0..1
  windSpeed: number; // m/s
  lightningRate: number; // 0..1
  waveAmp: number; // 0..1
}

export const WEATHER_TARGETS: Record<WeatherKind, WeatherTarget> = {
  clear: { cloud: 0.12, rain: 0.0, fog: 0.04, windSpeed: 2, lightningRate: 0.0, waveAmp: 0.1 },
  rain: { cloud: 0.62, rain: 0.5, fog: 0.24, windSpeed: 6, lightningRate: 0.06, waveAmp: 0.35 },
  storm: { cloud: 0.88, rain: 0.82, fog: 0.4, windSpeed: 13, lightningRate: 0.55, waveAmp: 0.65 },
  hurricane: { cloud: 0.99, rain: 1.0, fog: 0.55, windSpeed: 26, lightningRate: 0.9, waveAmp: 1.0 },
};

/**
 * Weighted transition table. Note hurricane is unreachable from clear/rain — it is
 * gated behind `storm` structurally (the only row that can roll "hurricane"), so no
 * extra guard is needed as long as we always roll from the *current* state.
 */
export const TRANSITIONS: Record<WeatherKind, ReadonlyArray<readonly [WeatherKind, number]>> = {
  clear: [["clear", 0.7], ["rain", 0.25], ["storm", 0.05]],
  rain: [["rain", 0.5], ["clear", 0.3], ["storm", 0.2]],
  storm: [["storm", 0.4], ["rain", 0.4], ["clear", 0.15], ["hurricane", 0.05]],
  hurricane: [["hurricane", 0.5], ["storm", 0.5]], // never straight back to clear
};

/** Roll a transition every N game-minutes (≈3.5 in-game hours). */
export const WEATHER_ROLL_MIN = 210;

/** Expected lightning strikes per game-minute at `lightningRate === 1`. */
export const MAX_LIGHTNING_PER_MIN = 8;

/** Deterministic default world seed (override for saved worlds / MP rooms). */
export const DEFAULT_WORLD_SEED = 0xc0ffee;

/** Tiny, dependency-free deterministic PRNG (32-bit). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Roll the next weather state from `kind` using the weighted table. `seasonBias`
 * scales the hurricane weight (hurricane-season). Pure w.r.t. the passed `rng`.
 */
export function stepWeather(kind: WeatherKind, rng: () => number, seasonBias = 1): WeatherKind {
  const rows = TRANSITIONS[kind];
  let total = 0;
  for (const [k, w] of rows) total += k === "hurricane" ? w * seasonBias : w;
  if (total <= 0) return kind;
  let r = rng() * total;
  for (const [k, w] of rows) {
    const weight = k === "hurricane" ? w * seasonBias : w;
    if ((r -= weight) <= 0) return k;
  }
  return kind;
}

/** Human-readable label for HUD/forecast. */
export function weatherLabel(kind: WeatherKind): string {
  switch (kind) {
    case "clear":
      return "Clear";
    case "rain":
      return "Rain";
    case "storm":
      return "Storm";
    case "hurricane":
      return "Hurricane";
    default:
      return kind;
  }
}
