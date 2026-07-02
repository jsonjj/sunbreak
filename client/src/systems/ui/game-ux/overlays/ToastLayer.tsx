// Stacked, auto-dismissing, priority-sorted toast overlay. aria-live=polite for SR. Enter/exit
// via transform+opacity only (Motion). Reads the store; store owns TTL timers + the cap.
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ToastCard } from "../kit/Toast";
import { useUxStore } from "../state/uiStore";
import s from "./ToastLayer.module.css";

export function ToastLayer() {
  const toasts = useUxStore((st) => st.toasts);
  const dismiss = useUxStore((st) => st.dismissToast);
  const reduce = useReducedMotion();

  return (
    <div className={s.layer} aria-live="polite" aria-relevant="additions text">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout={!reduce}
            initial={{ opacity: 0, x: reduce ? 0 : 40, scale: reduce ? 1 : 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: reduce ? 0 : 40, scale: reduce ? 1 : 0.96 }}
            transition={{ duration: reduce ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <ToastCard
              kind={t.kind}
              text={t.text}
              sub={t.sub}
              icon={t.icon}
              onDismiss={() => dismiss(t.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
