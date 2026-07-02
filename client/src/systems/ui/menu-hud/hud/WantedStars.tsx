import { useEffect, useRef, useState } from "react";
import { cx } from "../lib/cx";
import { HEAT_LABEL } from "../lib/hudModel";
import { useHudStore } from "../lib/stores";
import { IconStar } from "../lib/icons";
import styles from "../styles/hud.module.css";

const SLOTS = [0, 1, 2, 3, 4] as const;

/** Top-right 0–5 wanted stars. Filled = current heat; flashes while heat is active, dims
 *  briefly while cooling down (detected from a drop in heat). Iconography is generic. */
export function WantedStars() {
  const heat = useHudStore((s) => s.heat);
  const [cooling, setCooling] = useState(false);
  const prev = useRef(heat);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (heat < prev.current && heat > 0) {
      setCooling(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCooling(false), 1400);
    } else if (heat === 0 || heat > prev.current) {
      setCooling(false);
    }
    prev.current = heat;
    return () => clearTimeout(timer.current);
  }, [heat]);

  if (heat <= 0) return null;

  return (
    <div
      className={cx(styles.panel, styles.wanted, !cooling && styles.active, cooling && styles.cooling)}
      role="group"
      aria-label={`Wanted level ${heat} of 5`}
    >
      <div className={styles.wantedStars}>
        {SLOTS.map((i) => (
          <span key={i} className={cx(styles.wantedStar, i < heat && styles.on)}>
            <IconStar size={16} />
          </span>
        ))}
      </div>
      <span className={styles.wantedLabel}>{HEAT_LABEL[heat]}</span>
    </div>
  );
}
