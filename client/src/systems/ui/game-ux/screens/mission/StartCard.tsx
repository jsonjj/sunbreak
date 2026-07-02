// Timed mission "title card" shown on mission:start. Auto-dismisses; parent gates presence via
// <AnimatePresence>. Non-exclusive layer (floats above play; does not pause).
import { useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Icon } from "../../kit/Icon";
import { useUxStore, type MissionStartData } from "../../state/uiStore";
import s from "./mission.module.css";

export function StartCard({ data, holdMs = 5200 }: { data: MissionStartData; holdMs?: number }) {
  const reduce = useReducedMotion();
  const clear = useUxStore((st) => st.clearMissionStart);

  useEffect(() => {
    const t = setTimeout(clear, holdMs);
    return () => clearTimeout(t);
  }, [clear, holdMs, data.id]);

  return (
    <motion.div
      className={s.startWrap}
      initial={{ opacity: 0, y: reduce ? 0 : -18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduce ? 0 : -12 }}
      transition={{ duration: reduce ? 0 : 0.45, ease: [0.16, 1, 0.3, 1] }}
      role="status"
      aria-live="polite"
    >
      <div className={s.startCard}>
        <div className={s.startKicker}>
          <span className={s.dotLive} aria-hidden />
          New Score · {data.giver}
        </div>
        <h2 className={s.startTitle}>{data.title}</h2>
        <div className={s.startObjective}>
          <Icon name="target" size={16} />
          <span>{data.objective}</span>
        </div>
      </div>
      {!reduce && (
        <motion.div
          className={s.startTimer}
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: holdMs / 1000, ease: "linear" }}
        />
      )}
    </motion.div>
  );
}
