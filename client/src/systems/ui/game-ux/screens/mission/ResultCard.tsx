// SCORE COMPLETE / SCORE FAILED card on mission:pass|fail. Shows reward rows or fail reason
// and Retry / Continue actions that signal Missions via the bus.
import { motion, useReducedMotion } from "motion/react";
import { Button } from "../../kit/Button";
import { Money } from "../../kit/Money";
import { Icon } from "../../kit/Icon";
import { gameEvents } from "../../state/bus";
import { useUxStore, type MissionResultData } from "../../state/uiStore";
import s from "./mission.module.css";

export function ResultCard({ data }: { data: MissionResultData }) {
  const reduce = useReducedMotion();
  const clear = useUxStore((st) => st.clearMissionResult);

  const onContinue = () => {
    gameEvents.emit("mission:continue", { id: data.id });
    clear();
  };
  const onRetry = () => {
    gameEvents.emit("mission:retry", { id: data.id });
    clear();
  };

  return (
    <motion.div
      className={`${s.resultWrap} ux-interactive`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.3 }}
    >
      <motion.div
        className={s.resultCard}
        initial={{ opacity: 0, y: reduce ? 0 : 24, scale: reduce ? 1 : 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: reduce ? 0 : 12 }}
        transition={{ duration: reduce ? 0 : 0.42, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label={data.pass ? "Score complete" : "Score failed"}
      >
        <div className={`${s.resultBadge} ${data.pass ? s.pass : s.fail}`}>
          <Icon name={data.pass ? "star" : "alert"} size={22} />
        </div>
        <div className={s.resultKicker}>{data.title ?? "Score"}</div>
        <h1 className={`${s.resultWord} ${data.pass ? s.passText : s.failText}`}>
          {data.pass ? "SCORE COMPLETE" : "SCORE FAILED"}
        </h1>

        {data.pass ? (
          <div className={s.rewards}>
            {data.rewards?.cash != null && (
              <div className={s.rewardRow}>
                <span className={s.rewardLabel}>Payout</span>
                <Money value={data.rewards.cash} signed />
              </div>
            )}
            {data.rewards?.rep != null && (
              <div className={s.rewardRow}>
                <span className={s.rewardLabel}>Reputation</span>
                <span className={s.rewardVal}>+{data.rewards.rep}</span>
              </div>
            )}
            {data.medal && (
              <div className={s.rewardRow}>
                <span className={s.rewardLabel}>Rating</span>
                <span className={s.medal}>{data.medal}</span>
              </div>
            )}
            {data.rewards?.items?.map((it) => (
              <div className={s.rewardRow} key={it}>
                <span className={s.rewardLabel}>Unlocked</span>
                <span className={s.rewardVal}>{it}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className={s.failReason}>{data.reason}</p>
        )}

        <div className={s.resultActions}>
          {!data.pass && (
            <Button variant="ghost" onClick={onRetry} leading={<Icon name="back" size={16} />}>
              Retry
            </Button>
          )}
          <Button variant="primary" onClick={onContinue} trailing={<Icon name="forward" size={16} />}>
            Continue
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
