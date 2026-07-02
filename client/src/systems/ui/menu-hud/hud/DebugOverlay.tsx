import { useEffect, useRef } from "react";
import { cx } from "../lib/cx";
import { playerQuery } from "../lib/ecs";
import styles from "../styles/hud.module.css";

/** Dev overlay (fps + player position), refreshed imperatively. Gated by `?debug`. */
export function DebugOverlay() {
  const fpsRef = useRef<HTMLElement>(null);
  const posRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let acc = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = now - last;
      last = now;
      acc += dt;
      frames += 1;
      if (acc >= 500) {
        if (fpsRef.current) fpsRef.current.textContent = String(Math.round((frames * 1000) / acc));
        frames = 0;
        acc = 0;
      }
      const p = playerQuery.entities[0];
      if (p && posRef.current) {
        const { x, z } = p.transform.position;
        posRef.current.textContent = `${x.toFixed(0)}, ${z.toFixed(0)}`;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={cx(styles.panel, styles.debug)}>
      <span>
        FPS <b ref={fpsRef}>—</b>
      </span>
      <span>
        POS <b ref={posRef}>—</b>
      </span>
    </div>
  );
}
