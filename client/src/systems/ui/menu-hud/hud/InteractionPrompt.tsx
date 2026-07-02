import { cx } from "../lib/cx";
import { useUiStore } from "../lib/stores";
import styles from "../styles/hud.module.css";

/** Contextual "Press [E]" prompt (reads `uiStore.contextPrompt`). */
export function InteractionPrompt() {
  const prompt = useUiStore((s) => s.contextPrompt);
  if (!prompt) return null;
  return (
    <div className={cx(styles.panel, styles.prompt)}>
      <span className={styles.promptKey}>E</span>
      <span>{prompt}</span>
    </div>
  );
}
