import { useEffect, useRef } from "react";
import { isDebug } from "@/util/debug";
import { cx, toggleClass } from "../lib/cx";
import { useHudStore } from "../lib/stores";
import styles from "../styles/hud.module.css";
import { HealthArmorBars } from "./HealthArmorBars";
import { Minimap } from "./Minimap";
import { MoneyCounter } from "./MoneyCounter";
import { WantedStars } from "./WantedStars";
import { WeaponWidget } from "./WeaponWidget";
import { Speedometer } from "./Speedometer";
import { Crosshair } from "./Crosshair";
import { Toasts } from "./Toasts";
import { InteractionPrompt } from "./InteractionPrompt";
import { DebugOverlay } from "./DebugOverlay";

const IDLE_MS = 6000;
const LETTERBOX = "8vh";

/** The in-game HUD container: fixed, pointer-events:none, safe-area anchored, context-fading.
 *  Assembles every widget; nothing here re-renders per frame (transient/rAF paths do the work). */
export function GameHud({ cinematic = false }: { cinematic?: boolean }) {
  const hudRef = useRef<HTMLDivElement>(null);
  const inVehicle = useHudStore((s) => s.inVehicle);
  const debug = isDebug();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wake = () => {
      toggleClass(hudRef.current, styles.idle, false);
      clearTimeout(timer);
      timer = setTimeout(() => toggleClass(hudRef.current, styles.idle, true), IDLE_MS);
    };
    wake();
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener("mousemove", wake, opts);
    window.addEventListener("mousedown", wake, opts);
    window.addEventListener("wheel", wake, opts);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("mousedown", wake);
      window.removeEventListener("wheel", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  return (
    <div ref={hudRef} className={styles.hud}>
      {cinematic ? (
        <>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: LETTERBOX, background: "#000" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: LETTERBOX, background: "#000" }} />
        </>
      ) : null}

      {debug ? <DebugOverlay /> : null}
      <Toasts />

      <div className={cx(styles.corner, styles.tr, styles.fadeable)}>
        <MoneyCounter />
        <WantedStars />
      </div>

      <div className={cx(styles.corner, styles.bl)}>
        <HealthArmorBars />
        <Minimap />
      </div>

      <div className={cx(styles.corner, styles.br, styles.fadeable)}>
        {inVehicle ? <Speedometer /> : null}
        <WeaponWidget />
      </div>

      {!cinematic ? <Crosshair /> : null}

      <div className={cx(styles.corner, styles.bc)}>
        <InteractionPrompt />
      </div>
    </div>
  );
}
