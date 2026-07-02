import { input } from "@/input/InputManager";
import { useInputStore } from "../lib/stores";
import { Kbd } from "../components/primitives";
import styles from "../styles/hud.module.css";

/** Click-to-play mouse capture (pointer-lock needs a user gesture). Shown while unlocked. */
export function CapturePrompt() {
  const locked = useInputStore((s) => s.locked);
  if (locked) return null;

  const lock = () => input.requestLock();
  return (
    <div
      className={styles.capture}
      role="button"
      tabIndex={0}
      onClick={lock}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") lock();
      }}
    >
      <div className={styles.captureCard}>
        <div className={styles.captureKicker}>SANTA VISTA</div>
        <h1 className={styles.captureTitle}>Click to play</h1>
        <p className={styles.captureSub}>
          Capture your mouse to look around. Press <b>Esc</b> to release it and pause.
        </p>
        <div className={styles.captureKeys}>
          <Kbd>W</Kbd>
          <Kbd>A</Kbd>
          <Kbd>S</Kbd>
          <Kbd>D</Kbd>
          <Kbd>Shift</Kbd>
          <Kbd>Space</Kbd>
        </div>
      </div>
    </div>
  );
}
