// ─────────────────────────────────────────────────────────────────────────────
// SUNBREAK — gameplay/daynight — DAY/NIGHT & WEATHER SUBSYSTEM
// ─────────────────────────────────────────────────────────────────────────────
// The authoritative world-environment model: an in-game clock + a seeded weather
// FSM, publishing a shared, readable time-of-day + weather state that
// lighting/sky, vfx, and traffic/ped density consume, plus a wet-road grip signal
// for vehicles.
//
// State is published TWO ways (read whichever fits you):
//   • ECS singleton entity — `world.with("time_singleton")` carries `time_env`
//     (EnvSnapshot), `time_effects` (EnvEffects), `time_control` (EnvControlState).
//     Best for ECS systems (traffic/ped/vehicle) — live, in-place, zero-alloc.
//   • Store/hooks — `useEnvStore` (coarse, reactive, for HUD) + transient R3F hooks
//     (`useSunPosition`, `useEnvRef`, `useEffectsRef`) + live accessors
//     (`getEnv`, `getEffects`).
//
// This module self-registers on import via `registerModule` (loaders import this
// file automatically). Nothing is hand-mounted into App/Scene.

import type { SubsystemModule } from "@sunbreak/shared";
import type { World } from "miniplex";
import type { ClientEntity } from "@/ecs/clientEntity";
import { registerModule } from "@/game/registry";
import "./env.components"; // register the time_* ECS augmentation
import { envTickSystem, initEnv } from "./director";

type W = World<ClientEntity>;

export const daynight: SubsystemModule<W> = {
  id: "gameplay/daynight",
  systems: [envTickSystem],
  init: initEnv,
};

registerModule(daynight); // required self-registration side effect

// ── PUBLIC CONTRACT (what other subsystems import) ───────────────────────────

// Read shapes
export type { EnvSnapshot, EnvEffects, EnvControlState, WeatherKind } from "./types";

// Live ECS-singleton accessors (per-frame, no re-render)
export { getEnv, getEffects, getControl, getEnvEntity, ensureEnvSingleton } from "./singleton";

// Reactive store + imperative control (missions / cutscenes / debug)
export {
  useEnvStore,
  setTimeMinutes,
  setTimeOfDay,
  pauseTime,
  togglePause,
  setTimeScale,
  lockTime,
  forceWeather,
  clearForcedWeather,
  lockWeather,
  setSeasonBias,
} from "./store";
export type { EnvHudState } from "./store";

// React/R3F consumer hooks
export {
  useClock,
  useWeather,
  useForecast,
  useIsNight,
  useDayPart,
  useEnvHud,
  useEnvRef,
  useEffectsRef,
  useSunPosition,
} from "./hooks";

// Wet-road grip for vehicle physics
export {
  useWetRoadGrip,
  applyGripToController,
  computeWheelFriction,
  BASE_WHEEL_FRICTION_SLIP,
  BASE_SIDE_FRICTION_STIFFNESS,
} from "./applyVehicleGrip";
export type { WheelFrictionController, GripOptions } from "./applyVehicleGrip";

// Discrete event bus (lightning / hourChanged / weatherChanged)
export { envEvents } from "./events";
export type { EnvEventMap } from "./events";

// Pure model (for anyone who wants to derive or simulate directly)
export {
  advanceTime,
  sunDirection,
  tod01,
  formatClock,
  dayPart,
  GAME_MINUTES_PER_DAY,
  DAY_LENGTH_REAL_SEC,
  DEFAULT_TIME_SCALE,
} from "./time";
export type { DayPart } from "./time";
export {
  WEATHER_TARGETS,
  TRANSITIONS,
  WEATHER_ROLL_MIN,
  stepWeather,
  mulberry32,
  weatherLabel,
} from "./weather";
export type { WeatherTarget } from "./weather";
export { deriveEffects } from "./effects";
