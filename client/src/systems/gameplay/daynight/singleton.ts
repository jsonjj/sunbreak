// The well-known ECS singleton entity that carries the environment state. Created
// once at init; other ECS systems read it via `world.with("time_singleton")`, and
// R3F/React consumers read it via the live accessors below (or the hooks).

import "./env.components"; // ensure the time_* augmentation is in scope here
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { EnvSnapshot, EnvEffects, EnvControlState } from "./types";
import {
  DEFAULT_START_MINUTES,
  DEFAULT_TIME_SCALE,
  hourOf,
  isNightFromSun,
  minuteOf,
  sunDirection,
  tod01,
} from "./time";
import { WEATHER_TARGETS } from "./weather";
import { deriveEffects } from "./effects";

let entity: ClientEntity | null = null;

function createInitialSnapshot(): EnvSnapshot {
  const gm = DEFAULT_START_MINUTES;
  const t = tod01(gm);
  const sun = { x: 0, y: 1, z: 0 };
  sunDirection(t, sun);
  const base = WEATHER_TARGETS.clear;
  return {
    gameMinutes: gm,
    tod01: t,
    hour: hourOf(gm),
    minute: minuteOf(gm),
    isNight: isNightFromSun(sun.y),
    sun,
    weather: "clear",
    nextWeather: "clear",
    cloud: base.cloud,
    rain: base.rain,
    fog: base.fog,
    wind: [base.windSpeed, 0, 0],
    lightningRate: base.lightningRate,
    waveAmp: base.waveAmp,
    wetness: 0,
  };
}

function createInitialControl(): EnvControlState {
  return {
    paused: false,
    timeLocked: false,
    weatherLocked: false,
    timeScale: DEFAULT_TIME_SCALE,
    seasonBias: 1,
    forcedKind: null,
    setMinutes: null,
  };
}

/** Create the singleton if it doesn't exist yet (idempotent). */
export function ensureEnvSingleton(): ClientEntity {
  if (entity) return entity;

  // Defensive: reuse one if some other init path already added it.
  const arch = world.with("time_singleton");
  const existing = arch.entities.length > 0 ? arch.entities[0] : undefined;
  if (existing) {
    entity = existing;
    return entity;
  }

  const env = createInitialSnapshot();
  entity = world.add({
    time_singleton: true,
    time_env: env,
    time_effects: deriveEffects(env),
    time_control: createInitialControl(),
  });
  return entity;
}

/** The singleton entity (creates it if needed). */
export function getEnvEntity(): ClientEntity {
  return entity ?? ensureEnvSingleton();
}

/** Live, in-place-mutated environment snapshot. Read every frame; DON'T retain across frames. */
export function getEnv(): EnvSnapshot {
  return getEnvEntity().time_env as EnvSnapshot;
}

/** Live, in-place-mutated derived effects. */
export function getEffects(): EnvEffects {
  return getEnvEntity().time_effects as EnvEffects;
}

/** Live control surface (mutate via the setters in ./store). */
export function getControl(): EnvControlState {
  return getEnvEntity().time_control as EnvControlState;
}

/** Remove the singleton (cleanup on hot-reload / teardown). */
export function removeEnvSingleton(): void {
  if (entity) {
    world.remove(entity);
    entity = null;
  }
}
