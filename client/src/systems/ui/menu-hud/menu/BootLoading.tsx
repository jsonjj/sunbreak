import { useEffect, useRef } from "react";
import { useGameStore } from "../lib/stores";
import menu from "../styles/menu.module.css";

const TIP = "Tip: press P (or release the mouse) to pause. Esc frees your cursor.";

/**
 * Brand splash + progress bar driven by `gameStore.loadProgress`. Advances boot → main-menu
 * once assets finish. Progress updates transiently (no re-render).
 */
export function BootLoading() {
  const fill = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const apply = (p: number) => {
      const c = p < 0 ? 0 : p > 1 ? 1 : p;
      if (fill.current) fill.current.style.transform = `scaleX(${c})`;
      if (pctRef.current) pctRef.current.textContent = `${Math.round(c * 100)}%`;
      if (c >= 1 && useGameStore.getState().phase === "boot") {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          if (useGameStore.getState().phase === "boot") useGameStore.getState().setPhase("menu");
        }, 550);
      }
    };
    apply(useGameStore.getState().loadProgress);
    const unsub = useGameStore.subscribe((s) => s.loadProgress, apply);
    return () => {
      clearTimeout(timer.current);
      unsub();
    };
  }, []);

  return (
    <div className={menu.screen}>
      <div className={menu.backdrop} />
      <div className={menu.boot}>
        <div className={menu.bootInner}>
          <div className={menu.bootMark}>SUNBREAK</div>
          <h1 className={menu.bootTitle}>Santa Vista</h1>
          <div className={menu.bootBar}>
            <div ref={fill} className={menu.bootBarFill} style={{ transform: "scaleX(0)" }} />
          </div>
          <div className={menu.bootMeta}>
            <span className={menu.bootTip}>{TIP}</span>
            <span className={menu.bootPct} ref={pctRef}>
              0%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
