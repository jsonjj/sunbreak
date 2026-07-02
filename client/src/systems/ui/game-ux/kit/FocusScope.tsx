// Minimal focus trap for modal surfaces (KBM + gamepad-as-KBM). Traps Tab, fires onEscape,
// and restores focus on unmount. Hand-rolled per spec (fallback to @react-aria/focus noted as
// a later option, but that dep isn't pre-installed).
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface FocusScopeProps {
  children: ReactNode;
  active?: boolean;
  autoFocus?: boolean;
  restoreFocus?: boolean;
  onEscape?: () => void;
  className?: string;
}

export function FocusScope({
  children,
  active = true,
  autoFocus = true,
  restoreFocus = true,
  onEscape,
  className,
}: FocusScopeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    prev.current = document.activeElement as HTMLElement | null;
    const el = ref.current;
    if (autoFocus && el) {
      const first = el.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? el).focus();
    }
    return () => {
      if (restoreFocus) prev.current?.focus?.();
    };
  }, [active, autoFocus, restoreFocus]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEscape?.();
        return;
      }
      if (e.key !== "Tab") return;
      const el = ref.current;
      if (!el) return;
      const nodes = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null,
      );
      if (nodes.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [active, onEscape]);

  return (
    <div ref={ref} tabIndex={-1} className={className} style={{ outline: "none" }}>
      {children}
    </div>
  );
}
