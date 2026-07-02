import { cx } from "./cx";
import s from "./ProgressBar.module.css";

export interface ProgressBarProps {
  /** 0..100 */
  value: number;
  /** show a moving shimmer while active (loading). */
  indeterminate?: boolean;
  className?: string;
  label?: string;
}

export function ProgressBar({ value, indeterminate, className, label }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cx(s.track, className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cx(s.fill, indeterminate && s.shimmer)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
