// Built-in "Press E to talk" prompt. The proximity system also publishes to the shared
// UI `contextPrompt` slice for the HUD; this is the self-contained fallback so the prompt
// shows even before the HUD renders it. Non-interactive.

import type { NearbyConversable } from "../store";
import { OVERLAY_Z_INDEX } from "../constants";
import styles from "./dialogue.module.css";

export function NearbyPrompt({ npc }: { npc: NearbyConversable }) {
  return (
    <div className={styles.prompt} style={{ zIndex: OVERLAY_Z_INDEX - 1 }} aria-hidden>
      <kbd className={styles.promptKey}>E</kbd>
      <span>
        Talk to <strong>{npc.displayName}</strong>
      </span>
    </div>
  );
}
