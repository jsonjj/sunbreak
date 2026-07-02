// Driving assists live in GAMEPLAY (the solver lives in physics). We turn raw axes into a clean
// `DriverInput`: exponential steer smoothing, speed-sensitive steer lock (less lock at speed),
// and forward/reverse resolution from the current signed speed.

import {
  REVERSE_ENGAGE_KMH,
  STEER_LOCK_MIN,
  STEER_RETURN_RATE,
  STEER_TURN_RATE,
} from "./config";
import type { DriverAxes } from "./driverInput";
import type { DriverInput } from "./types";
import { clamp01, damp, lerp } from "./util";

/** Per-driver smoothing memory (keyed by vehicle netId in the drive system). */
export interface AssistState {
  steer: number;
}

export const newAssistState = (): AssistState => ({ steer: 0 });

/**
 * @param out         reused DriverInput to write into (zero per-frame allocation)
 * @param axes        raw pedal/steer intent
 * @param forwardKmh  signed forward speed (negative = reversing)
 * @param topSpeedKmh spec top speed, for the steer-lock curve
 */
export function applyAssists(
  out: DriverInput,
  axes: DriverAxes,
  forwardKmh: number,
  topSpeedKmh: number,
  st: AssistState,
  dt: number,
): DriverInput {
  // Speed-sensitive steer lock: full authority when slow, `STEER_LOCK_MIN` at top speed.
  const speedFrac = clamp01(Math.abs(forwardKmh) / Math.max(1, topSpeedKmh));
  const lock = lerp(1, STEER_LOCK_MIN, speedFrac);
  const targetSteer = axes.steer * lock;
  const rate = Math.abs(targetSteer) > Math.abs(st.steer) ? STEER_TURN_RATE : STEER_RETURN_RATE;
  st.steer = damp(st.steer, targetSteer, rate, dt);
  out.steer = st.steer;

  // Forward / brake / reverse resolution from signed speed.
  out.handbrake = axes.handbrake;
  if (forwardKmh > REVERSE_ENGAGE_KMH) {
    // Rolling forward: brake pedal brakes.
    out.throttle = axes.throttle;
    out.brake = axes.brake;
    out.reverse = false;
  } else if (forwardKmh < -REVERSE_ENGAGE_KMH) {
    // Rolling backward: accelerator brakes, brake pedal drives reverse.
    out.throttle = axes.brake;
    out.brake = axes.throttle;
    out.reverse = true;
  } else {
    // ~Stopped: brake pedal (alone) engages reverse; accelerator goes forward.
    if (axes.brake > 0 && axes.throttle === 0) {
      out.throttle = axes.brake;
      out.brake = 0;
      out.reverse = true;
    } else {
      out.throttle = axes.throttle;
      out.brake = axes.throttle > 0 ? 0 : axes.brake;
      out.reverse = false;
    }
  }
  return out;
}
