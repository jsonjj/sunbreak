// Global debug hotkeys. Attached once (only when the debug layer is active) and detached via the
// returned cleanup. Keys are ignored while the user is typing in a field (console/leva/inputs),
// so they never fight text entry. The console's own input handles backtick/escape locally.
//
//   `  (Backquote)  toggle console
//   F3             cycle overlay: off -> minimal -> full
//   F4             toggle ECS inspector
//   F9             toggle physics collider wireframes
//   F10            toggle Leva tuning panel

import { useDebugStore } from "./store/debugStore";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function onKeyDown(e: KeyboardEvent): void {
  if (isEditableTarget(e.target)) return;
  const s = useDebugStore.getState();
  switch (e.code) {
    case "Backquote":
      e.preventDefault();
      s.toggle("console");
      break;
    case "F3":
      e.preventDefault();
      s.cycleOverlay();
      break;
    case "F4":
      e.preventDefault();
      s.toggle("inspector");
      break;
    case "F9":
      e.preventDefault();
      s.toggle("physicsDebug");
      break;
    case "F10":
      e.preventDefault();
      s.toggle("leva");
      break;
    default:
      break;
  }
}

let installed = false;

/** Attach the hotkey listener. Idempotent; returns a cleanup that detaches it. */
export function installHotkeys(): () => void {
  if (typeof window === "undefined" || installed) return () => {};
  installed = true;
  window.addEventListener("keydown", onKeyDown);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    installed = false;
  };
}
