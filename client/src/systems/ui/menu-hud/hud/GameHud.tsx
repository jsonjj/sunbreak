import { useEffect, useRef, type CSSProperties } from "react";
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
import { Toasts } from "./Toasts";
import { InteractionPrompt } from "./InteractionPrompt";
import { ObjectiveTracker } from "./ObjectiveTracker";
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

      <div className={cx(styles.corner, styles.tl)}>
        <ObjectiveTracker />
      </div>

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
        <WeaponWheelHint />
      </div>

      {/* Reticle is drawn by combat's <CombatOverlay/> (spread-aware) — no static HUD crosshair here. */}

      <div className={cx(styles.corner, styles.bc)}>
        <InteractionPrompt />
      </div>
    </div>
  );
}

/** Subtle, unobtrusive control hint so players discover the weapon wheel. Fades with the HUD idle
 *  (it lives in the fadeable bottom-right corner). Pointer-events off (the HUD is non-interactive). */
function WeaponWheelHint() {
  const kbd: CSSProperties = {
    fontFamily: "inherit",
    fontSize: 10,
    fontWeight: 600,
    lineHeight: 1,
    padding: "2px 5px",
    borderRadius: 4,
    background: "rgba(255,255,255,0.14)",
    border: "1px solid rgba(255,255,255,0.22)",
    color: "rgba(255,255,255,0.92)",
  };
  return (
    <div
      style={{
        marginTop: 6,
        alignSelf: "flex-end",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        letterSpacing: 0.2,
        color: "rgba(255,255,255,0.62)",
        background: "rgba(10,13,20,0.42)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 999,
        padding: "3px 9px 3px 6px",
        whiteSpace: "nowrap",
      }}
    >
      <span style={kbd}>Tab</span>
      <span>Weapons</span>
    </div>
  );
}
