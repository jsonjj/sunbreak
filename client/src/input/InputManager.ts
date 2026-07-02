import {
  InputAction,
  InputContext,
  createEmptySnapshot,
  type InputSnapshot,
} from "@sunbreak/shared";
import { useSettingsStore } from "../stores/settings.store";
import { useInputStore } from "../stores/input.store";

const BASE_SENS = 0.0022; // radians per pixel at sensitivity 1.0
const PITCH_MIN = -0.6;
const PITCH_MAX = 1.1;

const TRACKED: InputAction[] = [
  InputAction.MoveForward,
  InputAction.MoveBack,
  InputAction.MoveLeft,
  InputAction.MoveRight,
  InputAction.Sprint,
  InputAction.Walk,
  InputAction.Crouch,
  InputAction.Jump,
  InputAction.Interact,
  InputAction.EnterExitVehicle,
  InputAction.Reload,
  InputAction.Fire,
  InputAction.Aim,
  InputAction.SwitchWeapon,
  InputAction.Pause,
];

/**
 * Singleton input manager. DOM events update live state immediately; consumers either read
 * live getters (player controller — order-independent) or the once-per-frame `snapshot`
 * (HUD/other). Zero per-frame allocation: one reused snapshot + reused Sets.
 */
class InputManager {
  private keys = new Set<string>();
  private mouseButtons = new Set<number>();
  /** Camera-space look, integrated directly from mouse deltas (shared by camera + player). */
  yaw = 0;
  pitch = 0;
  private el: HTMLElement | null = null;
  private snap: InputSnapshot = createEmptySnapshot();
  private prevPressed = new Set<InputAction>();
  private readonly moveOut = { x: 0, y: 0 };

  attach(el: HTMLElement): void {
    if (this.el) this.detach();
    this.el = el;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("visibilitychange", this.onVisibility);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    document.addEventListener("mousemove", this.onMouseMove);
    el.addEventListener("mousedown", this.onMouseDown);
    el.addEventListener("click", this.onClick);
    el.addEventListener("contextmenu", this.onContextMenu);
  }

  detach(): void {
    const el = this.el;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("visibilitychange", this.onVisibility);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    document.removeEventListener("mousemove", this.onMouseMove);
    if (el) {
      el.removeEventListener("mousedown", this.onMouseDown);
      el.removeEventListener("click", this.onClick);
      el.removeEventListener("contextmenu", this.onContextMenu);
    }
    this.el = null;
    this.keys.clear();
    this.mouseButtons.clear();
  }

  /** Explicitly request pointer lock (used by the click-to-play overlay). */
  requestLock(): void {
    if (!this.locked) this.el?.requestPointerLock();
  }

  /** Release pointer lock — used when dialogue/menus/phone open so the cursor is usable. */
  releaseLock(): void {
    if (this.locked && typeof document !== "undefined") document.exitPointerLock();
  }

  get locked(): boolean {
    return typeof document !== "undefined" && document.pointerLockElement === this.el;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
    if (e.code === "Space" || e.code === "Tab") e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };
  private onBlur = (): void => {
    this.keys.clear();
    this.mouseButtons.clear();
  };
  private onVisibility = (): void => {
    if (document.hidden) {
      this.keys.clear();
      this.mouseButtons.clear();
    }
  };
  private onClick = (): void => {
    this.requestLock();
  };
  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };
  private onPointerLockChange = (): void => {
    useInputStore.getState().setLocked(this.locked);
  };
  private onMouseDown = (e: MouseEvent): void => {
    this.mouseButtons.add(e.button);
  };
  private onMouseUp = (e: MouseEvent): void => {
    this.mouseButtons.delete(e.button);
  };
  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    const { controls } = useSettingsStore.getState();
    const sens = BASE_SENS * controls.mouseSensitivity;
    this.yaw -= e.movementX * sens;
    this.pitch += e.movementY * sens * (controls.invertY ? -1 : 1);
    if (this.pitch < PITCH_MIN) this.pitch = PITCH_MIN;
    if (this.pitch > PITCH_MAX) this.pitch = PITCH_MAX;
  };

  isActionDown(a: InputAction): boolean {
    switch (a) {
      case InputAction.MoveForward:
        return this.keys.has("KeyW") || this.keys.has("ArrowUp");
      case InputAction.MoveBack:
        return this.keys.has("KeyS") || this.keys.has("ArrowDown");
      case InputAction.MoveLeft:
        return this.keys.has("KeyA") || this.keys.has("ArrowLeft");
      case InputAction.MoveRight:
        return this.keys.has("KeyD") || this.keys.has("ArrowRight");
      case InputAction.Sprint:
        return this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
      case InputAction.Walk:
        return this.keys.has("AltLeft") || this.keys.has("AltRight");
      case InputAction.Crouch:
        return this.keys.has("KeyC") || this.keys.has("ControlLeft");
      case InputAction.Jump:
        return this.keys.has("Space");
      case InputAction.Interact:
        return this.keys.has("KeyE");
      case InputAction.EnterExitVehicle:
        return this.keys.has("KeyF");
      case InputAction.Reload:
        return this.keys.has("KeyR");
      case InputAction.Fire:
        return this.mouseButtons.has(0);
      case InputAction.Aim:
        return this.mouseButtons.has(2);
      case InputAction.SwitchWeapon:
        return this.keys.has("Tab");
      case InputAction.FirstPerson:
        return this.keys.has("KeyV");
      case InputAction.Pause:
        return this.keys.has("Escape");
      default:
        return false;
    }
  }

  /** Live, reused move vector (x = strafe, y = forward), un-normalized -1..1. */
  getMove(): { x: number; y: number } {
    this.moveOut.x =
      (this.isActionDown(InputAction.MoveRight) ? 1 : 0) -
      (this.isActionDown(InputAction.MoveLeft) ? 1 : 0);
    this.moveOut.y =
      (this.isActionDown(InputAction.MoveForward) ? 1 : 0) -
      (this.isActionDown(InputAction.MoveBack) ? 1 : 0);
    return this.moveOut;
  }

  /** Refresh the once-per-frame snapshot (edge flags + move). Called by <InputBinder>. */
  sample(): InputSnapshot {
    const s = this.snap;
    const m = this.getMove();
    s.move.x = m.x;
    s.move.y = m.y;
    s.look.x = 0;
    s.look.y = 0;
    s.usingGamepad = false;
    s.context = InputContext.OnFoot;
    s.justPressed.clear();
    s.justReleased.clear();
    for (const a of TRACKED) {
      const down = this.isActionDown(a);
      const was = this.prevPressed.has(a);
      if (down && !was) s.justPressed.add(a);
      if (!down && was) s.justReleased.add(a);
      if (down) s.pressed.add(a);
      else s.pressed.delete(a);
    }
    this.prevPressed.clear();
    for (const a of s.pressed) this.prevPressed.add(a);
    return s;
  }

  get snapshot(): InputSnapshot {
    return this.snap;
  }
}

export const input = new InputManager();
