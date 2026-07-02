import { cx } from "../lib/cx";
import { useUiStore } from "../lib/stores";
import styles from "../styles/hud.module.css";

/** Top-centre notification stack (reads `uiStore.toasts`; owners push/dismiss). */
export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className={styles.toasts} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx(styles.panel, styles.toast)}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
