// Boot / level-transition loader. DOM overlay (NOT <Html>), driven by drei useProgress with a
// monotonic clamp to kill the documented per-phase flicker. Also shows scripted-transition
// labels from the store.
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useProgress } from "@react-three/drei";
import { ProgressBar } from "../kit/ProgressBar";
import { useMonotonic } from "../hooks/useMonotonic";
import { useUxStore } from "../state/uiStore";
import s from "./LoadingScreen.module.css";

const TIPS = [
  "Verano never sleeps — neither does the meter.",
  "Cami patches you up. The ER bill patches them up.",
  "Duck the task force before your HEAT boils over.",
  "Clean cash spends anywhere. Dirty cash spends… carefully.",
  "Every Score has a giver, a clock, and a catch.",
  "Pull up the phone anytime — contacts don't pause the world.",
];

function basename(url: string): string {
  const clean = url.split("?")[0] ?? url;
  return clean.substring(clean.lastIndexOf("/") + 1) || clean;
}

function SunMark() {
  // Literal colors (mirroring tokens) — SVG presentation attributes don't resolve CSS var().
  return (
    <svg width="46" height="46" viewBox="0 0 48 48" fill="none" aria-hidden>
      <defs>
        <linearGradient id="ux-sun" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd166" />
          <stop offset="0.5" stopColor="#ff8a4c" />
          <stop offset="1" stopColor="#ff5d8f" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="26" r="9" fill="url(#ux-sun)" />
      <path d="M6 34h36" stroke="url(#ux-sun)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M11 39h26" stroke="#ff8a4c" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      {[...Array(7)].map((_, i) => {
        const a = (Math.PI / 8) * (i + 0.5);
        const x1 = 24 - Math.cos(a) * 13;
        const y1 = 26 - Math.sin(a) * 13;
        const x2 = 24 - Math.cos(a) * 17;
        const y2 = 26 - Math.sin(a) * 17;
        return (
          <path key={i} d={`M${x1} ${y1}L${x2} ${y2}`} stroke="#ffd166" strokeWidth="2" strokeLinecap="round" />
        );
      })}
    </svg>
  );
}

export function LoadingScreen() {
  const { active, progress, item, loaded, total } = useProgress();
  const label = useUxStore((st) => st.loadingLabel);
  const reduce = useReducedMotion();

  // New load session whenever drei flips inactive -> active, so the clamp can restart.
  const [session, setSession] = useState(0);
  const wasActive = useRef(false);
  useEffect(() => {
    if (active && !wasActive.current) setSession((n) => n + 1);
    wasActive.current = active;
  }, [active]);

  const target = active ? Math.min(progress, 99) : 100;
  const shown = useMonotonic(target, session);

  const [tip, setTip] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTip((n) => (n + 1) % TIPS.length), 3600);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      className={`${s.wrap} ux-interactive`}
      role="status"
      aria-live="polite"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.35 }}
    >
      <div className={s.bg} aria-hidden />
      <div className={s.center}>
        <div className={s.brandRow}>
          <SunMark />
          <div className={s.brandText}>
            <div className={s.brand}>SUNBREAK</div>
            <div className={s.tag}>{label ?? "Verano · streaming the city"}</div>
          </div>
        </div>

        <div className={s.barRow}>
          <ProgressBar value={shown} indeterminate={active && total === 0} label="Loading" />
          <div className={s.meta}>
            <span className={s.pct}>{Math.floor(shown)}%</span>
            <span className={s.count}>
              {total > 0 ? `${loaded}/${total}` : "preparing"}
              {item ? ` · ${basename(item)}` : ""}
            </span>
          </div>
        </div>

        <div className={s.tipRow}>
          <AnimatePresence mode="wait">
            <motion.p
              key={tip}
              className={s.tip}
              initial={{ opacity: 0, y: reduce ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -6 }}
              transition={{ duration: reduce ? 0 : 0.4 }}
            >
              {TIPS[tip]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
