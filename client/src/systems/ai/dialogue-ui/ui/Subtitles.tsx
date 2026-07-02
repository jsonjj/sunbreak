// Transient ambient-bark channel. Dialogue lines double as subtitles inside the panel;
// this renders the SEPARATE, TTL-expiring bark queue (peds/world → `pushSubtitle`).
// Non-interactive (pointer-events: none) so it never blocks gameplay when idle.

import { useDialogueStore } from "../store";
import { OVERLAY_Z_INDEX } from "../constants";
import styles from "./dialogue.module.css";

export function Subtitles() {
  const subtitles = useDialogueStore((s) => s.subtitles);
  if (subtitles.length === 0) return null;

  return (
    <div className={styles.subtitles} style={{ zIndex: OVERLAY_Z_INDEX - 1 }} aria-live="polite">
      {subtitles.map((sub) => (
        <div key={sub.id} className={styles.subtitle}>
          <span className={styles.subSpeaker} style={{ color: sub.speaker.color }}>
            {sub.speaker.displayName}
          </span>
          <span className={styles.subText}>{sub.text}</span>
        </div>
      ))}
    </div>
  );
}
