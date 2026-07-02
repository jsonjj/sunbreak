// Self-contained input for binds the v0 shared snapshot can't express yet (Tab hold, number
// keys, mouse-wheel cycle, holster, quick-heal). The CANONICAL wheel-open path is the shared
// input snapshot (see systems.ts / inventoryInputSystem); this keeps the subsystem fully
// playable today and is toggleable via `enableLocalInput` so the integrator can retire it once
// `SwitchWeapon` is sampled by the InputManager.

import { input } from "@/input/InputManager";
import { useInventoryStore } from "./store";

/** Set false (before boot) to rely solely on the shared input snapshot for wheel/reload. */
export const inputConfig = { enableLocalInput: true };

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}

/** Attach the local keyboard/wheel fallback. Returns a cleanup fn. */
export function installInputFallback(): () => void {
  if (!inputConfig.enableLocalInput || typeof window === "undefined") return () => {};
  const st = () => useInventoryStore.getState();

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat || isTypingTarget(e.target)) {
      if (e.code === "Tab") e.preventDefault(); // still swallow Tab autorepeat
      return;
    }
    switch (e.code) {
      case "Tab":
        e.preventDefault();
        st().openWheel();
        return;
      case "KeyH":
        st().holster();
        return;
      case "KeyG": {
        const id = st().bestHealItem();
        if (id) st().useConsumable(id);
        return;
      }
      default: {
        const digit = /^Digit([1-8])$/.exec(e.code) ?? /^Numpad([1-8])$/.exec(e.code);
        if (digit && digit[1]) st().quickEquipSlot(Number(digit[1]) - 1);
      }
    }
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === "Tab") {
      e.preventDefault();
      st().closeWheel();
    }
  };

  const onWheel = (e: WheelEvent): void => {
    const open = st().wheelOpen;
    // Only hijack scroll during gameplay (pointer locked) or while the wheel is open.
    if (!open && !input.locked) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    if (open) st().cycleHover(dir);
    else st().cycle(dir);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("wheel", onWheel);
  };
}

/** Release pointer-lock while the wheel is open, re-acquire on close. Returns a cleanup fn. */
export function installPointerLockSync(): () => void {
  return useInventoryStore.subscribe(
    (s) => s.wheelOpen,
    (open) => {
      if (typeof document === "undefined") return;
      if (open) {
        if (document.pointerLockElement) document.exitPointerLock();
      } else {
        input.requestLock();
      }
    },
  );
}
