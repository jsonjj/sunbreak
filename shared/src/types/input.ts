// Input contracts. Two representations, both authored here so every consumer + (v4) netcode
// agrees on shape:
//   - InputSnapshot: rich, per-frame device state produced by the client input manager.
//   - PlayerInput:   compact, sim/net-facing input stored on the ECS `input` component.

export type Axis2 = { x: number; y: number };

/** drei <KeyboardControls> logical control names (v0 stopgap + rebind labels). */
export enum Controls {
  forward = "forward",
  back = "back",
  left = "left",
  right = "right",
  sprint = "sprint",
  walk = "walk",
  crouch = "crouch",
  jump = "jump",
  aim = "aim",
  fire = "fire",
  reload = "reload",
  interact = "interact",
  enterExit = "enterExit",
  firstPerson = "firstPerson",
  cycleCamera = "cycleCamera",
  shoulderSwap = "shoulderSwap",
  pause = "pause",
}

/** Logical actions the input manager resolves bindings into. */
export enum InputAction {
  MoveForward,
  MoveBack,
  MoveLeft,
  MoveRight,
  Jump,
  Sprint,
  Walk,
  Crouch,
  Interact,
  Aim,
  Fire,
  Reload,
  SwitchWeapon,
  SwitchCharacter,
  EnterExitVehicle,
  Accelerate,
  Brake,
  Handbrake,
  Horn,
  LookBack,
  FirstPerson,
  CycleCamera,
  ShoulderSwap,
  MenuUp,
  MenuDown,
  MenuLeft,
  MenuRight,
  MenuConfirm,
  MenuBack,
  Pause,
}

/** Compact button bitmask for the networked PlayerInput. */
export enum Button {
  Jump = 1 << 0,
  Sprint = 1 << 1,
  Crouch = 1 << 2,
  Fire = 1 << 3,
  Aim = 1 << 4,
  Interact = 1 << 5,
  Reload = 1 << 6,
  EnterExit = 1 << 7,
}

export enum InputContext {
  OnFoot = "onFoot",
  Vehicle = "vehicle",
  Menu = "menu",
  Cutscene = "cutscene",
}

/** Rich per-frame snapshot from the input manager (non-reactive; read in useFrame). */
export interface InputSnapshot {
  move: Axis2; // -1..1 (x = strafe, y = forward), camera-relative resolved by controller
  look: Axis2; // per-frame delta (mouse) or rate (stick)
  zoom: number;
  throttle: number;
  brake: number;
  steer: number;
  pressed: Set<InputAction>;
  justPressed: Set<InputAction>;
  justReleased: Set<InputAction>;
  context: InputContext;
  usingGamepad: boolean;
}

export const createEmptySnapshot = (): InputSnapshot => ({
  move: { x: 0, y: 0 },
  look: { x: 0, y: 0 },
  zoom: 0,
  throttle: 0,
  brake: 0,
  steer: 0,
  pressed: new Set<InputAction>(),
  justPressed: new Set<InputAction>(),
  justReleased: new Set<InputAction>(),
  context: InputContext.OnFoot,
  usingGamepad: false,
});

/** Compact input stored on the ECS `input` component + sent over the wire (v4). */
export interface PlayerInput {
  seq: number;
  dt: number;
  move: Axis2; // normalized, camera-relative planar
  lookYaw: number;
  lookPitch: number;
  buttons: number; // bitmask of Button
  throttle: number;
  brake: number;
  steer: number;
}

export const createEmptyPlayerInput = (): PlayerInput => ({
  seq: 0,
  dt: 0,
  move: { x: 0, y: 0 },
  lookYaw: 0,
  lookPitch: 0,
  buttons: 0,
  throttle: 0,
  brake: 0,
  steer: 0,
});

export const hasButton = (buttons: number, b: Button): boolean => (buttons & b) !== 0;
