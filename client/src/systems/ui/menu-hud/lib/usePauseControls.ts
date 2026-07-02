import { useEffect } from "react";
import { input } from "@/input/InputManager";
import { useGameStore } from "./stores";

/**
 * Wires the GTA-like pause flow without fighting the input subsystem:
 *  • losing pointer-lock during play (Chrome reserves ESC for this) → auto-open pause
 *  • `P` toggles pause; resuming re-requests pointer-lock from the (implicit) user gesture
 *
 * Pointer-lock ownership stays with the input subsystem; we only read lock state + call the
 * shared game-store pause/resume actions.
 */
export function usePauseControls(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    const onPointerLockChange = (): void => {
      const locked = document.pointerLockElement != null;
      const { phase, pause } = useGameStore.getState();
      if (!locked && phase === "playing") pause();
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== "KeyP" || e.repeat) return;
      const { phase, pause, resume } = useGameStore.getState();
      if (phase === "playing") {
        pause();
      } else if (phase === "paused") {
        resume();
        input.requestLock();
      }
    };

    document.addEventListener("pointerlockchange", onPointerLockChange);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled]);
}
