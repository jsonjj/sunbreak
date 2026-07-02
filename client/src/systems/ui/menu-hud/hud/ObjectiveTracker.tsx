import { cx } from "../lib/cx";
import { useMissionStore } from "@/systems/gameplay/missions";
import type { HudObjective } from "@/systems/gameplay/missions";
import styles from "../styles/hud.module.css";

const MARK: Record<HudObjective["state"], string> = {
  pending: "○",
  active: "▶",
  complete: "✓",
  failed: "✕",
};

function formatTime(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? "0" : ""}${r}`;
}

/**
 * Top-left mission objective tracker. Reads the mission store (active title + stage + objective
 * checklist + optional timer) and mirrors the GTA "current job" panel. Renders nothing when no
 * mission is active. Re-renders only on discrete mission transitions (not per frame).
 */
export function ObjectiveTracker() {
  const activeTitle = useMissionStore((s) => s.activeTitle);
  const stageTitle = useMissionStore((s) => s.activeStageTitle);
  const objectives = useMissionStore((s) => s.hudObjectives);
  const timer = useMissionStore((s) => s.timer);

  if (!activeTitle) return null;
  const visible = objectives.filter((o) => !o.guard);
  const timerFrac = timer && timer.total > 0 ? Math.max(0, Math.min(1, timer.remaining / timer.total)) : 0;
  const timerLow = timer ? timer.remaining <= 10 : false;

  return (
    <div className={cx(styles.panel, styles.objective)} role="group" aria-label="Mission objective">
      <div className={styles.objectiveKicker}>{activeTitle}</div>
      {stageTitle ? <div className={styles.objectiveTitle}>{stageTitle}</div> : null}

      {visible.length > 0 ? (
        <ul className={styles.objectiveList}>
          {visible.map((o) => (
            <li
              key={o.id}
              className={cx(
                styles.objectiveRow,
                o.state === "complete" && styles.objDone,
                o.state === "failed" && styles.objFailed,
                o.state === "active" && styles.objActive,
                o.optional && styles.objOptional,
              )}
            >
              <span className={styles.objectiveMark}>{MARK[o.state]}</span>
              <span className={styles.objectiveLabel}>
                {o.label}
                {o.optional ? <span className={styles.objectiveOpt}> (optional)</span> : null}
              </span>
              {o.count ? (
                <span className={styles.objectiveCount}>
                  {o.count.have}/{o.count.need}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {timer ? (
        <div className={cx(styles.objectiveTimer, timerLow && styles.objectiveTimerLow)}>
          <div className={styles.objectiveTimerHead}>
            <span>Time</span>
            <span>{formatTime(timer.remaining)}</span>
          </div>
          <div className={styles.objectiveTimerTrack}>
            <div className={styles.objectiveTimerFill} style={{ transform: `scaleX(${timerFrac})` }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
