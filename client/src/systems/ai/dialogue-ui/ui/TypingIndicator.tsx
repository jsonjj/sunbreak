// Three animated dots shown while opening a turn / awaiting the first token.
// Motion is disabled under `prefers-reduced-motion` (see dialogue.module.css).

import styles from "./dialogue.module.css";

export function TypingIndicator() {
  return (
    <span className={styles.typing} role="status" aria-label="Thinking">
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.dot} />
    </span>
  );
}
