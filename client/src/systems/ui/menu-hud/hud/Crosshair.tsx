import { useHudStore, useInputStore } from "../lib/stores";
import styles from "../styles/hud.module.css";

/** Minimal centre reticle — only while the pointer is locked and on foot. */
export function Crosshair() {
  const locked = useInputStore((s) => s.locked);
  const inVehicle = useHudStore((s) => s.inVehicle);
  if (!locked || inVehicle) return null;
  return (
    <div className={styles.crosshair} aria-hidden="true">
      <span className={styles.chDot} />
    </div>
  );
}
