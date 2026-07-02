import { cx } from "./cx";
import s from "./Money.module.css";

export interface MoneyProps {
  value: number;
  /** show an explicit +/- and color by sign. */
  signed?: boolean;
  /** dim label appended after the amount (e.g. "clean" / "stash"). */
  tag?: string;
  className?: string;
}

export function formatMoney(value: number): string {
  const abs = Math.abs(Math.round(value));
  return `$${abs.toLocaleString("en-US")}`;
}

export function Money({ value, signed, tag, className }: MoneyProps) {
  const positive = value >= 0;
  const sign = signed ? (positive ? "+" : "-") : "";
  return (
    <span
      className={cx(s.money, signed && (positive ? s.pos : s.neg), className)}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {sign}
      {formatMoney(value)}
      {tag ? <span className={s.tag}>{tag}</span> : null}
    </span>
  );
}
