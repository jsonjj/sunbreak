import { Controls } from "@sunbreak/shared";

/** drei <KeyboardControls> map (kept for the v1 full input manager / rebinding UI).
 *  v0 reads devices directly via the InputManager singleton. */
export interface KeyMapEntry {
  name: Controls;
  keys: string[];
}

export const KEYMAP: KeyMapEntry[] = [
  { name: Controls.forward, keys: ["KeyW", "ArrowUp"] },
  { name: Controls.back, keys: ["KeyS", "ArrowDown"] },
  { name: Controls.left, keys: ["KeyA", "ArrowLeft"] },
  { name: Controls.right, keys: ["KeyD", "ArrowRight"] },
  { name: Controls.sprint, keys: ["ShiftLeft", "ShiftRight"] },
  { name: Controls.walk, keys: ["AltLeft", "AltRight"] },
  { name: Controls.crouch, keys: ["KeyC", "ControlLeft"] },
  { name: Controls.jump, keys: ["Space"] },
  { name: Controls.interact, keys: ["KeyE"] },
  { name: Controls.enterExit, keys: ["KeyF"] },
  { name: Controls.reload, keys: ["KeyR"] },
  { name: Controls.pause, keys: ["Escape"] },
];
