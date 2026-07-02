import { useEffect } from "react";
import { input } from "@/input/InputManager";
import { useGameStore, useUiStore } from "./stores";

/**
 * Wires the GTA-like pause + map flow without fighting the input subsystem:
 *  • losing pointer-lock during play (Chrome reserves ESC for this) → auto-open pause
 *  • `P` toggles pause; resuming re-requests pointer-lock from the (implicit) user gesture
 *  • `M` toggles the full map: opens the pause shell on the "Map" tab (freeing the cursor), and
 *    resumes if the map is already up
 *
 * Pointer-lock ownership stays with the input subsystem; we only read lock state + call the shared
 * game-store pause/resume actions.
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
      if (e.repeat) return;
      const game = useGameStore.getState();
      const ui = useUiStore.getState();

      if (e.code === "KeyP") {
        if (game.phase === "playing") {
          game.pause();
        } else if (game.phase === "paused") {
          game.resume();
          input.requestLock();
        }
        return;
      }

      // `M` opens/closes the map (via the pause shell). Ignore while typing in an input.
      if (e.code === "KeyM") {
        const target = e.target as HTMLElement | null;
        if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
        if (game.phase === "playing") {
          ui.setPauseTab("map");
          game.pause();
          input.releaseLock();
        } else if (game.phase === "paused") {
          if (ui.pauseTab === "map") {
            game.resume();
            input.requestLock();
          } else {
            ui.setPauseTab("map");
          }
        }
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
