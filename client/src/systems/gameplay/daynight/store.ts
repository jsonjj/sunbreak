// Reactive, COARSE mirror of the environment for the HUD (zustand,
// subscribeWithSelector). The director writes here only when a coarse value
// actually changes (≈ once per in-game minute), so the HUD never re-renders every
// frame. Per-frame consumers must use the live accessors / transient hooks, NOT
// this store.
//
// This module also hosts the imperative control API (setTime / pause / forceWeather
// / locks / scale). Those mutate the singleton's `time_control` in place; the
// director applies them on the next tick.

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { WeatherKind } from "./types";
import type { DayPart } from "./time";
import { getControl } from "./singleton";

export interface EnvHudState {
  hour: number;
  minute: number;
  /** "HH:MM" 24h clock string. */
  clock: string;
  dayPart: DayPart;
  isNight: boolean;
  weather: WeatherKind;
  nextWeather: WeatherKind;
  /** Quantized 0..1 (0.05 steps) so it doesn't thrash React. */
  wetness: number;
  paused: boolean;
  timeScale: number;
}

interface EnvHudStore extends EnvHudState {
  /** INTERNAL — the director mirrors coarse values here on change. */
  _sync: (p: Partial<EnvHudState>) => void;
}

export const useEnvStore = create<EnvHudStore>()(
  subscribeWithSelector((set) => ({
    hour: 8,
    minute: 0,
    clock: "08:00",
    dayPart: "day",
    isNight: false,
    weather: "clear",
    nextWeather: "clear",
    wetness: 0,
    paused: false,
    timeScale: 1,
    _sync: (p) => set(p),
  })),
);

// ─────────────────────────────────────────────────────────────────────────────
// Imperative control API — safe to call from React events, missions, or console.
// ─────────────────────────────────────────────────────────────────────────────

/** Jump the clock to an absolute game-minute (0..1440). Applied next tick. */
export function setTimeMinutes(minutes: number): void {
  getControl().setMinutes = minutes;
}

/** Jump the clock to a wall-clock hour/minute. */
export function setTimeOfDay(hour: number, minute = 0): void {
  getControl().setMinutes = (hour % 24) * 60 + minute;
}

/** Freeze/unfreeze the clock (weather still evolves). */
export function pauseTime(paused = true): void {
  getControl().paused = paused;
  useEnvStore.getState()._sync({ paused });
}

export function togglePause(): void {
  pauseTime(!getControl().paused);
}

/** Game-minutes advanced per real second (default 1). */
export function setTimeScale(scale: number): void {
  getControl().timeScale = scale;
  useEnvStore.getState()._sync({ timeScale: scale });
}

/** Hold the clock without pausing the rest of the sim. */
export function lockTime(locked = true): void {
  getControl().timeLocked = locked;
}

/** Force a weather state (and lock the FSM by default). Damps toward it. */
export function forceWeather(kind: WeatherKind, lock = true): void {
  const c = getControl();
  c.forcedKind = kind;
  c.weatherLocked = lock;
}

/** Resume the automatic weather FSM. */
export function clearForcedWeather(): void {
  const c = getControl();
  c.forcedKind = null;
  c.weatherLocked = false;
}

/** Lock/unlock the weather FSM (keeps current forcedKind, if any). */
export function lockWeather(locked = true): void {
  getControl().weatherLocked = locked;
}

/** Hurricane-season bias for the FSM (1 = neutral). */
export function setSeasonBias(bias: number): void {
  getControl().seasonBias = bias;
}
