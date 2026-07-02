// Binding → glyph resolution. Reads the LIVE input config (`@/input/keymap`) so remaps show
// correctly, and degrades gracefully to "unbound". Glyphs are plain key labels rendered as
// styled <kbd> chips — no external atlas, so it stays 100% free (a Kenney/Xelu CC0 atlas can
// swap in later behind this same API).
import { Controls, InputAction } from "@sunbreak/shared";
import { KEYMAP } from "@/input/keymap";

/** Turn a KeyboardEvent.code into a short, friendly label. */
export function formatKeyCode(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  switch (code) {
    case "ArrowUp":
      return "↑";
    case "ArrowDown":
      return "↓";
    case "ArrowLeft":
      return "←";
    case "ArrowRight":
      return "→";
    case "ShiftLeft":
    case "ShiftRight":
      return "Shift";
    case "ControlLeft":
    case "ControlRight":
      return "Ctrl";
    case "AltLeft":
    case "AltRight":
      return "Alt";
    case "Space":
      return "Space";
    case "Escape":
      return "Esc";
    default:
      return code;
  }
}

const dedupe = (labels: string[]): string[] => [...new Set(labels)];

/** Bound key labels for a logical control, read live from the input keymap. */
export function keysForControl(control: Controls): string[] {
  const entry = KEYMAP.find((k) => k.name === control);
  if (!entry) return [];
  return dedupe(entry.keys.map(formatKeyCode));
}

/** Mouse-driven actions the keyboard map doesn't cover. */
const MOUSE_GLYPHS: Partial<Record<InputAction, string[]>> = {
  [InputAction.Fire]: ["LMB"],
  [InputAction.Aim]: ["RMB"],
};

/** Sensible KBM driving defaults (v0 InputManager doesn't bind these yet). */
const DRIVE_DEFAULTS: Partial<Record<InputAction, string[]>> = {
  [InputAction.Accelerate]: ["W"],
  [InputAction.Brake]: ["S"],
  [InputAction.Handbrake]: ["Space"],
};

/** Glyph chips for a logical action, with graceful "unbound" ([]) fallback. */
export function glyphsForAction(action: InputAction): string[] {
  switch (action) {
    case InputAction.MoveForward:
      return keysForControl(Controls.forward);
    case InputAction.MoveBack:
      return keysForControl(Controls.back);
    case InputAction.MoveLeft:
      return keysForControl(Controls.left);
    case InputAction.MoveRight:
      return keysForControl(Controls.right);
    case InputAction.Jump:
      return keysForControl(Controls.jump);
    case InputAction.Sprint:
      return keysForControl(Controls.sprint);
    case InputAction.Walk:
      return keysForControl(Controls.walk);
    case InputAction.Crouch:
      return keysForControl(Controls.crouch);
    case InputAction.Interact:
      return keysForControl(Controls.interact);
    case InputAction.EnterExitVehicle:
      return keysForControl(Controls.enterExit);
    case InputAction.Reload:
      return keysForControl(Controls.reload);
    case InputAction.Pause:
      return keysForControl(Controls.pause);
    case InputAction.CycleCamera:
      return keysForControl(Controls.cycleCamera);
    default:
      return MOUSE_GLYPHS[action] ?? DRIVE_DEFAULTS[action] ?? [];
  }
}

/** First glyph for an action (for single-chip hints), or "?" when unbound. */
export function firstGlyph(action: InputAction): string {
  return glyphsForAction(action)[0] ?? "?";
}

/** All four WASD-style movement glyphs, in reading order. */
export function moveGlyphs(): string[] {
  return dedupe([
    ...keysForControl(Controls.forward),
    ...keysForControl(Controls.left),
    ...keysForControl(Controls.back),
    ...keysForControl(Controls.right),
  ]);
}
