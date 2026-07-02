import { useRef } from "react";
import { cx } from "../lib/cx";
import { clamp01 } from "../lib/format";
import { useHudTransient } from "../lib/useHudTransient";
import styles from "../styles/hud.module.css";

const MAX_KPH = 260;
const ARC = 75; // % of the circle used for the 270° gauge sweep

/** Bottom-right vehicle speedometer. Mounted only while `inVehicle`; the arc + number update
 *  transiently, so top speed at 60fps never touches React. */
export function Speedometer() {
  const bar = useRef<SVGCircleElement>(null);
  const value = useRef<HTMLSpanElement>(null);

  useHudTransient(
    (s) => s.speedKmh,
    (kph) => {
      const frac = clamp01(kph / MAX_KPH);
      if (bar.current) bar.current.style.strokeDashoffset = String(ARC * (1 - frac));
      if (value.current) value.current.textContent = String(Math.round(kph));
    },
  );

  return (
    <div className={cx(styles.panel, styles.speedo)} role="group" aria-label="Speed">
      <div className={styles.speedoGauge}>
        <svg width="54" height="54" viewBox="0 0 54 54" aria-hidden="true">
          <defs>
            <linearGradient id="sb-speed-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--sb-amber)" />
              <stop offset="60%" stopColor="var(--sb-coral)" />
              <stop offset="100%" stopColor="var(--sb-rose)" />
            </linearGradient>
          </defs>
          <circle
            className={styles.speedoTrack}
            cx="27"
            cy="27"
            r="22"
            strokeWidth="5"
            pathLength={100}
            strokeDasharray={`${ARC} 100`}
            transform="rotate(135 27 27)"
          />
          <circle
            ref={bar}
            className={styles.speedoBar}
            cx="27"
            cy="27"
            r="22"
            strokeWidth="5"
            pathLength={100}
            strokeDasharray={`${ARC} 100`}
            strokeDashoffset={ARC}
            transform="rotate(135 27 27)"
          />
        </svg>
      </div>
      <div className={styles.speedoReadout}>
        <span ref={value} className={styles.speedoValue}>
          0
        </span>
        <span className={styles.speedoUnit}>KM/H</span>
      </div>
    </div>
  );
}
