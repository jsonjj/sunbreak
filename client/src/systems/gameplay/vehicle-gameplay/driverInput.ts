// Reads the SHARED input snapshot (sampled by <InputBinder> at priority -1000) and produces raw
// driving axes. We never open our own DOM/gamepad listeners — the InputManager singleton is the
// single source of truth. It already exposes throttle/brake/steer fields (populated once the
// input subsystem wires gamepad triggers); until then we derive them from the WASD move vector.

import { InputAction } from "@sunbreak/shared";
import { input } from "@/input/InputManager";
import { clamp, clamp01 } from "./util";

/** Raw pedal/steer intent, before assists + reverse resolution. */
export interface DriverAxes {
  throttle: number; // 0..1 (W / right trigger)
  brake: number; // 0..1 (S / left trigger) — may become reverse downstream
  steer: number; // -1..1 (A/D / left stick x)
  handbrake: boolean; // Space
}

const axes: DriverAxes = { throttle: 0, brake: 0, steer: 0, handbrake: false };

export function readDriverAxes(): DriverAxes {
  const s = input.snapshot;
  // Prefer explicit driving axes (gamepad / rebinds) when present, else fall back to move.
  axes.steer = s.steer !== 0 ? clamp(s.steer, -1, 1) : clamp(s.move.x, -1, 1);
  axes.throttle = s.throttle !== 0 ? clamp01(s.throttle) : clamp01(Math.max(0, s.move.y));
  axes.brake = s.brake !== 0 ? clamp01(s.brake) : clamp01(Math.max(0, -s.move.y));
  axes.handbrake = s.pressed.has(InputAction.Jump); // Space
  return axes;
}
