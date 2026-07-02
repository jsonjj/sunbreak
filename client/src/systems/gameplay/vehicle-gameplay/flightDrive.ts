// Flight + boat control resolution (gameplay side). Reads the live input device and writes the
// extended axes on the shared `veh_input` (pitch/roll/yaw/lift) that the physics flight/boat
// models consume. Persistent throttle/collective ("power") ramps with Shift/Ctrl so aircraft
// behave like real throttles rather than digital on/off. Steering/attitude are lightly smoothed.
//
// Control scheme (keyboard):
//   Helicopter — Shift/Ctrl collective (climb/descend), W/S cyclic pitch, A/D roll, Q/E tail yaw.
//   Plane      — Shift/Ctrl throttle,   W/S elevator,     A/D ailerons, Q/E rudder.
//   Boat       — W/S throttle & reverse, A/D rudder.
// (Look is always the mouse; F enters/exits. None of this touches on-foot input.)
import { InputAction } from "@sunbreak/shared";
import { input } from "@/input/InputManager";
import type { DriverInput as PhysDriverInput } from "@/systems/physics/vehicle";
import { clamp01, damp } from "./util";

interface ControlState {
  power: number; // 0..1 persistent collective (heli) / throttle (plane)
  pitch: number;
  roll: number;
  yaw: number;
  steer: number;
}

const states = new Map<number, ControlState>();

const stateFor = (netId: number): ControlState => {
  let s = states.get(netId);
  if (!s) {
    s = { power: 0, pitch: 0, roll: 0, yaw: 0, steer: 0 };
    states.set(netId, s);
  }
  return s;
};

const axis = (pos: boolean, neg: boolean): number => (pos ? 1 : 0) - (neg ? 1 : 0);

/** Read the three attitude axes shared by heli + plane (already in physics sign convention). */
function readAttitude() {
  const fwd = input.isActionDown(InputAction.MoveForward);
  const back = input.isActionDown(InputAction.MoveBack);
  const left = input.isActionDown(InputAction.MoveLeft);
  const right = input.isActionDown(InputAction.MoveRight);
  return {
    // W = nose down, S = nose up  → physics pitch +1 = nose up.
    pitch: axis(back, fwd),
    // D = bank right → physics roll +1 = right.
    roll: axis(right, left),
    // E = yaw right, Q = yaw left.
    yaw: axis(input.isKeyDown("KeyE"), input.isKeyDown("KeyQ")),
  };
}

const POWER_RATE = 0.7; // full throttle/collective sweep in ~1.4 s
const ATT_SMOOTH = 10;

/**
 * Resolve helicopter / plane intent into `out`. `fixedWing` picks throttle (plane, along nose)
 * vs collective (heli, along body-up); both share the pitch/roll/yaw controls.
 */
export function applyFlightControls(
  out: PhysDriverInput,
  netId: number,
  fixedWing: boolean,
  dt: number,
): void {
  const st = stateFor(netId);
  const up = input.isActionDown(InputAction.Sprint); // Shift
  const down = input.isActionDown(InputAction.Crouch); // C / Ctrl
  st.power = clamp01(st.power + axis(up, down) * POWER_RATE * dt);

  const a = readAttitude();
  st.pitch = damp(st.pitch, a.pitch, ATT_SMOOTH, dt);
  st.roll = damp(st.roll, a.roll, ATT_SMOOTH, dt);
  st.yaw = damp(st.yaw, a.yaw, ATT_SMOOTH, dt);

  out.pitch = st.pitch;
  out.roll = st.roll;
  out.yaw = st.yaw;
  if (fixedWing) {
    out.throttle = st.power;
    out.lift = 0;
  } else {
    out.lift = st.power;
    out.throttle = 0;
  }
  // Ground vehicles' fields left inert for craft.
  out.brake = 0;
  out.steer = 0;
  out.reverse = false;
  out.handbrake = false;
}

/** Resolve boat intent: W/S throttle & reverse, A/D rudder. */
export function applyBoatControls(out: PhysDriverInput, netId: number, dt: number): void {
  const st = stateFor(netId);
  const fwd = input.isActionDown(InputAction.MoveForward);
  const back = input.isActionDown(InputAction.MoveBack);
  const steerRaw = axis(
    input.isActionDown(InputAction.MoveRight),
    input.isActionDown(InputAction.MoveLeft),
  );
  st.steer = damp(st.steer, steerRaw, 6, dt);

  out.throttle = fwd ? 1 : 0;
  out.brake = back ? 1 : 0; // reverse thrust (handled in boat.ts)
  out.steer = st.steer;
  out.pitch = 0;
  out.roll = 0;
  out.yaw = 0;
  out.lift = 0;
  out.reverse = false;
  out.handbrake = false;
}

/** Drop a driver's smoothing memory (called when a vehicle despawns / on reset). */
export const forgetFlightState = (netId: number): void => {
  states.delete(netId);
};

/** Cleanup for init()'s disposer. */
export const resetFlightDrive = (): void => {
  states.clear();
};
