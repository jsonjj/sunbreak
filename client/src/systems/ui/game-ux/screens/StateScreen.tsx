// FLATLINE (death) / BOOKED (arrest) full-screen shell. Shared shell driven by store.state;
// charges the fee via the economy seam on confirm, then emits revive/released so the Player /
// Wanted systems can teleport + reset. Honors reduced motion.
import { motion, useReducedMotion } from "motion/react";
import { Money } from "../kit/Money";
import { Glyph } from "../kit/Glyph";
import { useHoldAction } from "../hooks/useHoldAction";
import { gameEvents } from "../state/bus";
import { getEconomy } from "../state/economyAdapter";
import { useUxStore, type StateScreenData } from "../state/uiStore";
import s from "./StateScreen.module.css";

const RING = 2 * Math.PI * 26;

export function StateScreen({ data }: { data: StateScreenData }) {
  const reduce = useReducedMotion();
  const clearState = useUxStore((st) => st.clearState);
  const isBooked = data.variant === "booked";

  const confirm = () => {
    if (data.fee && data.fee > 0) getEconomy().charge(data.fee, "clean");
    gameEvents.emit(isBooked ? "player:released" : "player:revive");
    // Fallback for standalone use if the event->store wiring isn't installed.
    clearState();
  };

  const { progress, begin, stop } = useHoldAction({
    onComplete: confirm,
    durationMs: 1100,
    keys: [" ", "Enter", "e", "E"],
  });

  const feeKind = isBooked ? "Bail / bribe" : "ER checkout";

  return (
    <motion.div
      className={`${s.wrap} ux-interactive ux-grain`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.5 }}
      role="dialog"
      aria-modal="true"
      aria-label={data.word}
    >
      <div className={s.center}>
        <motion.div
          className={s.kicker}
          initial={{ opacity: 0, y: reduce ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduce ? 0 : 0.15, duration: reduce ? 0 : 0.5 }}
        >
          {isBooked ? "Kessler's Task Force" : "Verano General"}
        </motion.div>

        <motion.h1
          className={`${s.word} ${isBooked ? s.booked : s.flatline}`}
          initial={{ opacity: 0, scale: reduce ? 1 : 1.08, letterSpacing: reduce ? "0.06em" : "0.2em" }}
          animate={{ opacity: 1, scale: 1, letterSpacing: "0.06em" }}
          transition={{ duration: reduce ? 0 : 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          {data.word}
        </motion.h1>

        <motion.p
          className={s.subtitle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduce ? 0 : 0.35, duration: reduce ? 0 : 0.5 }}
        >
          {data.subtitle}
        </motion.p>

        {data.fee != null && data.fee > 0 && (
          <div className={s.fee}>
            <span className={s.feeLabel}>{feeKind}</span>
            <Money value={-data.fee} signed />
          </div>
        )}

        <div className={s.holdRow}>
          <button
            className={s.hold}
            onPointerDown={begin}
            onPointerUp={stop}
            onPointerLeave={stop}
            aria-label={data.prompt ?? "Hold to continue"}
          >
            <svg className={s.ring} width="64" height="64" viewBox="0 0 64 64" aria-hidden>
              <circle className={s.ringBg} cx="32" cy="32" r="26" />
              <circle
                className={s.ringFg}
                cx="32"
                cy="32"
                r="26"
                strokeDasharray={RING}
                strokeDashoffset={RING * (1 - progress)}
              />
            </svg>
            <Glyph k="Space" className={s.holdGlyph} />
          </button>
          <div className={s.holdText}>
            <span className={s.holdTitle}>{data.prompt ?? "Hold to continue"}</span>
            <span className={s.holdHint}>
              Hold <Glyph k="Space" /> / <Glyph k="E" /> to confirm
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
