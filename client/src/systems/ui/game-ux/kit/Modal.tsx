// Dialog surface (backdrop + focus-trapped panel), animated with Motion (transform/opacity
// only). Parents control presence via <AnimatePresence>{open && <Modal .../>}</AnimatePresence>
// so exit transitions play.
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cx } from "./cx";
import { FocusScope } from "./FocusScope";
import { Icon } from "./Icon";
import s from "./Modal.module.css";

export interface ModalProps {
  onClose?: () => void;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  dismissable?: boolean;
  className?: string;
  labelId?: string;
}

export function Modal({
  onClose,
  title,
  children,
  footer,
  width = 460,
  dismissable = true,
  className,
  labelId,
}: ModalProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cx(s.backdrop, "ux-interactive")}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.2 }}
      onMouseDown={(e) => {
        if (dismissable && e.target === e.currentTarget) onClose?.();
      }}
    >
      <FocusScope onEscape={dismissable ? onClose : undefined}>
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelId}
          className={cx(s.dialog, className)}
          style={{ width }}
          initial={{ opacity: 0, y: reduce ? 0 : 16, scale: reduce ? 1 : 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: reduce ? 0 : 8, scale: reduce ? 1 : 0.98 }}
          transition={{ duration: reduce ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          {(title != null || dismissable) && (
            <header className={s.head}>
              <h2 id={labelId} className={s.title}>
                {title}
              </h2>
              {dismissable && (
                <button className={s.close} onClick={onClose} aria-label="Close">
                  <Icon name="close" size={18} />
                </button>
              )}
            </header>
          )}
          <div className={s.body}>{children}</div>
          {footer != null && <footer className={s.foot}>{footer}</footer>}
        </motion.div>
      </FocusScope>
    </motion.div>
  );
}
