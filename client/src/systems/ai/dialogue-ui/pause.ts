// Soft-pause: freeze the sim while a conversation is open, then restore cleanly.
//
// We consume the CORE-LOOP pause flag — the shared game store `phase` — rather than
// inventing a private one, so any sim/physics/ped system that already gates on
// `phase !== "playing"` honors it for free. Rendering + the dialogue camera keep
// running (the Canvas is `frameloop="always"`), so the scene stays live under the
// overlay. We also free the cursor for clicking and release any keys held at open.
//
// NOTE (integrator): v0 systems don't yet gate on `phase`, and there is no shared
// `inputLocked` flag. Keyboard leakage is contained by the overlay (focus-trap +
// stopPropagation before InputManager's window listener). For a hard movement lock,
// have the player controller early-out when `useDialogueStore.getState().isBlockingInput()`.

import type { GamePhase } from "@sunbreak/shared";
import { useGameStore } from "@/stores/game.store";
import { input } from "@/input/InputManager";

let active = false;
let prevPhase: GamePhase | null = null;

export const dialoguePause = {
  get active(): boolean {
    return active;
  },

  enter(): void {
    if (active) return;
    active = true;

    const game = useGameStore.getState();
    prevPhase = game.phase;
    if (game.phase !== "paused") game.setPhase("paused");

    // Drop any keys the InputManager latched before the overlay took focus, so the
    // player doesn't keep "walking" behind the panel. (InputManager clears on blur.)
    if (typeof window !== "undefined") window.dispatchEvent(new Event("blur"));

    // Free the mouse so choices / the text field are clickable.
    if (typeof document !== "undefined") document.exitPointerLock?.();
  },

  exit(): void {
    if (!active) return;
    active = false;

    useGameStore.getState().setPhase(prevPhase ?? "playing");
    prevPhase = null;

    // Best-effort re-capture (works when we leave via a click gesture; after Esc the
    // browser blocks re-lock briefly and the v0 "click to play" prompt recovers).
    try {
      input.requestLock();
    } catch {
      /* ignore */
    }
  },
};
