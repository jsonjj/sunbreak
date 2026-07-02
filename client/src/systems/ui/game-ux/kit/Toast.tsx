// Presentational single-toast card. The queue/animation lives in overlays/ToastLayer.
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";
import type { ToastKind } from "../state/bus";
import s from "./Toast.module.css";

const KIND_ICON: Record<ToastKind, IconName> = {
  cash: "cash",
  pickup: "pickup",
  info: "info",
  objective: "target",
  heat: "alert",
  combat: "shield",
  save: "check",
};

export interface ToastCardProps {
  kind: ToastKind;
  text: string;
  sub?: string;
  icon?: string;
  onDismiss?: () => void;
}

export function ToastCard({ kind, text, sub, icon, onDismiss }: ToastCardProps) {
  const iconName = (icon as IconName) ?? KIND_ICON[kind] ?? "info";
  return (
    <div className={cx(s.toast, s[kind])} role="status">
      <span className={s.rail} aria-hidden />
      <span className={s.icon}>
        <Icon name={iconName} size={18} />
      </span>
      <span className={s.body}>
        <span className={s.text}>{text}</span>
        {sub ? <span className={s.sub}>{sub}</span> : null}
      </span>
      {onDismiss ? (
        <button className={s.close} onClick={onDismiss} aria-label="Dismiss">
          <Icon name="close" size={14} />
        </button>
      ) : null}
    </div>
  );
}
