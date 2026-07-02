import { cx } from "../lib/cx";
import { useUiStore } from "../lib/stores";
import styles from "../styles/hud.module.css";

/** Contextual "Press [key]" prompt (reads `uiStore.contextPrompt`). The key glyph is derived
 *  from the prompt's leading "Press <KEY>" token so it always matches the action (E interact,
 *  F enter/exit vehicle, X cancel, …) instead of a hardcoded "E". */
export function InteractionPrompt() {
  const prompt = useUiStore((s) => s.contextPrompt);
  if (!prompt) return null;
  const key = /^\s*Press\s+(\S+)/i.exec(prompt)?.[1] ?? "E";
  return (
    <div className={cx(styles.panel, styles.prompt)}>
      <span className={styles.promptKey}>{key}</span>
      <span>{prompt}</span>
    </div>
  );
}
