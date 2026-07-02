import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx";
import { IconChevronDown } from "../lib/icons";
import styles from "../styles/components.module.css";

/* ── Button ──────────────────────────────────────────────────────────────── */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  block?: boolean;
  icon?: ReactNode;
  hint?: string;
}
export function Button({
  variant = "secondary",
  size = "md",
  block,
  icon,
  hint,
  className,
  children,
  type,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cx(
        styles.btn,
        styles[variant],
        size === "lg" && styles.lg,
        block && styles.block,
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {hint ? <span className={styles.btnHint}>{hint}</span> : null}
    </button>
  );
}

/* ── Panel / Card ────────────────────────────────────────────────────────── */
export function Panel({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx(styles.panel, className)} {...rest}>
      {children}
    </div>
  );
}
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx(styles.card, className)} {...rest}>
      {children}
    </div>
  );
}

/* ── Field row ───────────────────────────────────────────────────────────── */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldText}>
        <span className={styles.fieldLabel}>{label}</span>
        {hint ? <span className={styles.fieldHint}>{hint}</span> : null}
      </div>
      <div className={styles.fieldControl}>{children}</div>
    </div>
  );
}

/* ── Slider ──────────────────────────────────────────────────────────────── */
export function Slider({
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  format,
  ariaLabel,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  ariaLabel?: string;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const p = pct < 0 ? 0 : pct > 100 ? 100 : pct;
  return (
    <div className={styles.slider}>
      <input
        type="range"
        className={styles.sliderInput}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        style={{
          background: `linear-gradient(90deg, var(--sb-accent) ${p}%, rgba(255,255,255,0.14) ${p}%)`,
        }}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
      />
      <span className={styles.sliderValue}>{format ? format(value) : value}</span>
    </div>
  );
}

/* ── Toggle ──────────────────────────────────────────────────────────────── */
export function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={cx(styles.toggle, checked && styles.on)}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.toggleKnob} />
    </button>
  );
}

/* ── Select ──────────────────────────────────────────────────────────────── */
export interface Option<T extends string> {
  value: T;
  label: string;
}
export function Select<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: ReadonlyArray<Option<T>>;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <span className={styles.selectWrap}>
      <select
        className={styles.select}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <IconChevronDown size={15} className={styles.selectChevron} />
    </span>
  );
}

/* ── Segmented ───────────────────────────────────────────────────────────── */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: ReadonlyArray<Option<T>>;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={cx(styles.segment, value === o.value && styles.segmentOn)}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Tabs (vertical rail) ────────────────────────────────────────────────── */
export interface TabItem<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}
export function Tabs<T extends string>({
  value,
  items,
  onChange,
}: {
  value: T;
  items: ReadonlyArray<TabItem<T>>;
  onChange: (v: T) => void;
}) {
  return (
    <div className={styles.tabs} role="tablist" aria-orientation="vertical">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="tab"
          aria-selected={value === it.value}
          className={cx(styles.tab, value === it.value && styles.tabOn)}
          onClick={() => onChange(it.value)}
        >
          {it.icon ? <span className={styles.tabIcon}>{it.icon}</span> : null}
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ── Kbd ─────────────────────────────────────────────────────────────────── */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}
