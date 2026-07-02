// Input probe — translates the REAL input singleton into bus events every frame so onboarding
// works today, before the player/vehicle/combat subsystems emit their own. It only synthesises
// events that ARE the local player's raw input (moves, look, sprint, jump, interact, fire, aim,
// reload); semantic events (vehicle:enter, zone:enter, combat:hitTarget) come from ECS truth in
// the runner/CanvasLayer. When a real producer starts emitting, these simply become redundant.
import { InputAction } from "@sunbreak/shared";
import { input } from "@/input/InputManager";
import { emitGameEvent } from "./bus";
import type { MoveDir } from "./bus";

const MOVE_EDGES: ReadonlyArray<readonly [InputAction, MoveDir]> = [
  [InputAction.MoveForward, "fwd"],
  [InputAction.MoveBack, "back"],
  [InputAction.MoveLeft, "left"],
  [InputAction.MoveRight, "right"],
];

const LOOK_EPS = 1e-4;

let prevYaw = 0;
let prevPitch = 0;
let primed = false;

/** update-phase system (registered early). Reads the freshly-sampled snapshot + look angles. */
export function probeSystem(): void {
  const snap = input.snapshot;

  // Movement direction edges (drives the Move card + sprint hint).
  for (const [action, dir] of MOVE_EDGES) {
    if (snap.justPressed.has(action)) emitGameEvent("player:move", { dir });
  }

  if (snap.justPressed.has(InputAction.Sprint)) emitGameEvent("player:sprint");
  if (snap.justPressed.has(InputAction.Jump)) emitGameEvent("player:jump");
  if (snap.justPressed.has(InputAction.Interact)) emitGameEvent("player:interact");
  if (snap.justPressed.has(InputAction.Fire)) emitGameEvent("combat:fire");
  if (snap.justPressed.has(InputAction.Aim)) emitGameEvent("combat:aimStart");
  if (snap.justPressed.has(InputAction.Reload)) emitGameEvent("combat:reload");

  // Camera look, integrated from mouse deltas on the input singleton.
  if (!primed) {
    prevYaw = input.yaw;
    prevPitch = input.pitch;
    primed = true;
  }
  const dx = input.yaw - prevYaw;
  const dy = input.pitch - prevPitch;
  prevYaw = input.yaw;
  prevPitch = input.pitch;
  if (Math.abs(dx) > LOOK_EPS || Math.abs(dy) > LOOK_EPS) {
    emitGameEvent("player:look", { dx, dy });
  }
}
