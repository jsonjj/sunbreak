import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import s from "./Panel.module.css";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** glass = frosted overlay surface; solid = opaque panel; bare = no chrome. */
  tone?: "glass" | "solid" | "bare";
  inset?: boolean;
  children?: ReactNode;
}

export function Panel({ tone = "glass", inset, className, children, ...rest }: PanelProps) {
  return (
    <div className={cx(s.panel, s[tone], inset && s.inset, className)} {...rest}>
      {children}
    </div>
  );
}
