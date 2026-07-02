// The single environment tick. Registered into the `update` phase (early, order
// -100) so lighting/vfx/traffic/vehicle systems in the same phase read fresh state
// the same frame. O(1) and allocation-free: it mutates the singleton's `time_env`
// and `time_effects` IN PLACE, and only touches the reactive store when a coarse
// value changes.

import * as THREE from "three";
import type { System } from "@sunbreak/shared";
import type { World } from "miniplex";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { WeatherKind } from "./types";
import {
  MAX_FRAME_DT,
  advanceTime,
  dayPart,
  formatClock,
  hourOf,
  isNightFromSun,
  minuteOf,
  sunDirection,
  tod01,
  wrapMinutes,
} from "./time";
import {
  DEFAULT_WORLD_SEED,
  MAX_LIGHTNING_PER_MIN,
  WEATHER_ROLL_MIN,
  WEATHER_TARGETS,
  mulberry32,
  stepWeather,
} from "./weather";
import { WETNESS_DRY, WETNESS_RISE, deriveEffects } from "./effects";
import { ensureEnvSingleton, getControl, getEffects, getEnv, removeEnvSingleton } from "./singleton";
import { useEnvStore } from "./store";
import { envEvents } from "./events";

type W = World<ClientEntity>;

// Frame-rate-independent smoothing. Higher λ = snappier; ~0.18 → a few-second ease.
const DAMP_LAMBDA = 0.18;
// Slow drift of the wind heading (rad/s) so gusts rotate over minutes, not seconds.
const WIND_DRIFT = 0.03;

// --- module-scoped FSM sim state (client single-player authority for v1/v2) ---
let rng: () => number = mulberry32(DEFAULT_WORLD_SEED);
let current: WeatherKind = "clear";
let next: WeatherKind = "clear";
let rollAcc = 0;
let windHeading = 0;

// coarse HUD change-detection (mirror only on change → no per-frame React churn)
const lastHud = {
  hour: -1,
  minute: -1,
  weather: "" as WeatherKind | "",
  nextWeather: "" as WeatherKind | "",
  isNight: false,
  wetnessQ: -1,
  part: "" as string,
};

function mirrorHud(): void {
  const env = getEnv();
  const c = getControl();
  const wetnessQ = Math.round(env.wetness * 20) / 20;
  const part = dayPart(env.tod01);
  if (
    env.hour === lastHud.hour &&
    env.minute === lastHud.minute &&
    env.weather === lastHud.weather &&
    env.nextWeather === lastHud.nextWeather &&
    env.isNight === lastHud.isNight &&
    wetnessQ === lastHud.wetnessQ &&
    part === lastHud.part
  ) {
    return;
  }
  lastHud.hour = env.hour;
  lastHud.minute = env.minute;
  lastHud.weather = env.weather;
  lastHud.nextWeather = env.nextWeather;
  lastHud.isNight = env.isNight;
  lastHud.wetnessQ = wetnessQ;
  lastHud.part = part;

  useEnvStore.getState()._sync({
    hour: env.hour,
    minute: env.minute,
    clock: formatClock(env.gameMinutes),
    dayPart: part,
    isNight: env.isNight,
    weather: env.weather,
    nextWeather: env.nextWeather,
    wetness: wetnessQ,
    paused: c.paused,
    timeScale: c.timeScale,
  });
}

function tick(dt: number): void {
  const env = getEnv();
  const effects = getEffects();
  const c = getControl();
  const clampedDt = dt > MAX_FRAME_DT ? MAX_FRAME_DT : dt < 0 ? 0 : dt;

  // 1) imperative time jump (scrub / setTime), applied before advancing
  if (c.setMinutes != null) {
    env.gameMinutes = wrapMinutes(c.setMinutes);
    c.setMinutes = null;
  }

  // 2) clock
  if (!c.paused && !c.timeLocked) {
    env.gameMinutes = advanceTime(env.gameMinutes, clampedDt, c.timeScale);
  }
  env.tod01 = tod01(env.gameMinutes);
  env.hour = hourOf(env.gameMinutes);
  env.minute = minuteOf(env.gameMinutes);
  sunDirection(env.tod01, env.sun);
  env.isNight = isNightFromSun(env.sun.y);

  // 3) weather FSM (game-minutes elapsed this frame)
  const dtGameMin = (c.paused ? 0 : clampedDt) * c.timeScale;
  if (c.weatherLocked && c.forcedKind) {
    current = c.forcedKind;
    next = c.forcedKind;
  } else if (!c.paused) {
    rollAcc += dtGameMin;
    while (rollAcc >= WEATHER_ROLL_MIN) {
      rollAcc -= WEATHER_ROLL_MIN;
      current = next; // commit the previously forecasted state
      next = stepWeather(current, rng, c.seasonBias); // hurricane gated behind storm in the table
    }
  }
  const prevWeather = env.weather;
  env.weather = current;
  env.nextWeather = next;

  // 4) damp continuous params toward the current state's targets
  const tgt = WEATHER_TARGETS[current];
  env.cloud = THREE.MathUtils.damp(env.cloud, tgt.cloud, DAMP_LAMBDA, clampedDt);
  env.rain = THREE.MathUtils.damp(env.rain, tgt.rain, DAMP_LAMBDA, clampedDt);
  env.fog = THREE.MathUtils.damp(env.fog, tgt.fog, DAMP_LAMBDA, clampedDt);
  env.lightningRate = THREE.MathUtils.damp(env.lightningRate, tgt.lightningRate, DAMP_LAMBDA, clampedDt);
  env.waveAmp = THREE.MathUtils.damp(env.waveAmp, tgt.waveAmp, DAMP_LAMBDA, clampedDt);

  // wind: drift the heading slowly, damp the speed toward target
  windHeading += clampedDt * WIND_DRIFT;
  const curSpeed = Math.hypot(env.wind[0], env.wind[2]);
  const spd = THREE.MathUtils.damp(curSpeed, tgt.windSpeed, DAMP_LAMBDA, clampedDt);
  env.wind[0] = Math.cos(windHeading) * spd;
  env.wind[1] = 0;
  env.wind[2] = Math.sin(windHeading) * spd;

  // 5) wetness accumulator (rises in rain, decays when dry)
  const rate = env.rain > 0.1 ? WETNESS_RISE * env.rain : -WETNESS_DRY;
  env.wetness = THREE.MathUtils.clamp(env.wetness + rate * clampedDt, 0, 1);

  // 6) derived gameplay signals — in place
  deriveEffects(env, effects);

  // 7) discrete events
  if (env.hour !== lastHud.hour && lastHud.hour !== -1) {
    envEvents.emit("hourChanged", { hour: env.hour, env });
  }
  if (prevWeather !== env.weather) {
    envEvents.emit("weatherChanged", { from: prevWeather, to: env.weather, env });
  }
  if (env.lightningRate > 0.001 && dtGameMin > 0) {
    const expected = env.lightningRate * MAX_LIGHTNING_PER_MIN * dtGameMin;
    if (rng() < expected) {
      envEvents.emit("lightning", {
        intensity: 0.5 + 0.5 * env.lightningRate,
        at: typeof performance !== "undefined" ? performance.now() : Date.now(),
        env,
      });
    }
  }

  // 8) coarse HUD mirror (change-detected)
  mirrorHud();
}

/** The registered `update`-phase system. Runs early so consumers read fresh state. */
export const envTickSystem: System<W> = {
  name: "daynight/env",
  phase: "update",
  order: -100,
  fn: (_world, dt) => tick(dt),
};

/** Module init: create the singleton, seed the FSM + forecast, expose DEV console hooks. */
export function initEnv(): () => void {
  ensureEnvSingleton();
  const env = getEnv();
  const c = getControl();

  rng = mulberry32(DEFAULT_WORLD_SEED);
  rollAcc = 0;
  windHeading = 0;
  current = env.weather;
  next = stepWeather(current, rng, c.seasonBias); // seed an initial forecast
  env.nextWeather = next;

  // reset HUD change-detection so the first tick always mirrors
  lastHud.hour = -1;

  if (import.meta.env.DEV && typeof window !== "undefined") {
    (window as unknown as { __sunbreakEnv?: unknown }).__sunbreakEnv = {
      getEnv,
      getEffects,
      getControl,
    };
  }

  return () => {
    if (import.meta.env.DEV && typeof window !== "undefined") {
      delete (window as unknown as { __sunbreakEnv?: unknown }).__sunbreakEnv;
    }
    removeEnvSingleton();
  };
}
