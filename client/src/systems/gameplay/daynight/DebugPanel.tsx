// OPTIONAL leva debug panel — scrub time and force/lock weather. NOT auto-mounted
// and intentionally NOT re-exported from index.ts (so leva stays out of the default
// bundle). A debug host (e.g. content/debug-tools) can import and render it:
//
//     import { EnvDebugPanel } from "@/systems/gameplay/daynight/DebugPanel";
//     {debug && <EnvDebugPanel />}

import { useControls } from "leva";
import {
  clearForcedWeather,
  forceWeather,
  pauseTime,
  setSeasonBias,
  setTimeOfDay,
  setTimeScale,
} from "./store";
import type { WeatherKind } from "./types";

const WEATHER_OPTIONS = ["auto", "clear", "rain", "storm", "hurricane"] as const;

export function EnvDebugPanel(): null {
  useControls("Environment", () => ({
    time: {
      value: 8,
      min: 0,
      max: 23.99,
      step: 0.25,
      label: "Time (h)",
      onChange: (h: number) => setTimeOfDay(Math.floor(h), Math.round((h % 1) * 60)),
    },
    timeScale: {
      value: 1,
      min: 0,
      max: 120,
      step: 1,
      label: "Scale (min/s)",
      onChange: (s: number) => setTimeScale(s),
    },
    pause: {
      value: false,
      onChange: (p: boolean) => pauseTime(p),
    },
    weather: {
      value: "auto",
      options: WEATHER_OPTIONS as unknown as string[],
      onChange: (w: string) => {
        if (w === "auto") clearForcedWeather();
        else forceWeather(w as WeatherKind);
      },
    },
    seasonBias: {
      value: 1,
      min: 0,
      max: 8,
      step: 0.5,
      label: "Hurricane bias",
      onChange: (b: number) => setSeasonBias(b),
    },
  }));

  return null;
}
