// Tiny typed event bus for DISCRETE environment signals (VFX/Audio). Continuous
// params are read from the snapshot; only edge-triggered things go through here.

import mitt from "mitt";
import type { Emitter } from "mitt";
import type { EnvSnapshot, WeatherKind } from "./types";

export type EnvEventMap = {
  /** Fired once when the integer clock hour rolls over. */
  hourChanged: { hour: number; env: EnvSnapshot };
  /** Fired when the FSM commits to a new weather state. */
  weatherChanged: { from: WeatherKind; to: WeatherKind; env: EnvSnapshot };
  /** Fired on each lightning strike (VFX flash + Audio thunder bed). */
  lightning: { intensity: number; at: number; env: EnvSnapshot };
};

/** Subscribe with `envEvents.on("lightning", (e) => …)`. Snapshot is live — don't retain. */
export const envEvents: Emitter<EnvEventMap> = mitt<EnvEventMap>();
