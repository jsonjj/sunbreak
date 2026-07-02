// Self-contained inline styles for the debug DOM tools. We never touch global CSS (it lives
// outside this subsystem's folder), so every panel styles itself with these tokens.

import type { CSSProperties } from "react";

export const MONO =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

/** Above the game HUD, below OS chrome. */
export const Z_BASE = 100000;

export const C = {
  bg: "rgba(15, 17, 23, 0.92)",
  bgSolid: "#0f1117",
  border: "rgba(255, 255, 255, 0.10)",
  text: "#e6e9ef",
  dim: "#8b93a7",
  accent: "#3b82f6",
  good: "#4ade80",
  warn: "#fbbf24",
  bad: "#f87171",
} as const;

export const panelStyle: CSSProperties = {
  position: "fixed",
  boxSizing: "border-box",
  fontFamily: MONO,
  fontSize: 12,
  lineHeight: 1.5,
  color: C.text,
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  backdropFilter: "blur(8px)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
  pointerEvents: "auto",
  zIndex: Z_BASE,
};

export const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "6px 10px",
  borderBottom: `1px solid ${C.border}`,
  color: C.dim,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  fontSize: 10,
  userSelect: "none",
};

export const buttonStyle: CSSProperties = {
  appearance: "none",
  cursor: "pointer",
  fontFamily: MONO,
  fontSize: 11,
  color: C.text,
  background: "rgba(255,255,255,0.06)",
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "4px 9px",
  whiteSpace: "nowrap",
};

export const buttonActiveStyle: CSSProperties = {
  ...buttonStyle,
  color: "#fff",
  background: C.accent,
  borderColor: C.accent,
};

export const inputStyle: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  fontFamily: MONO,
  fontSize: 12,
  color: C.text,
  background: "rgba(0,0,0,0.35)",
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "6px 8px",
  outline: "none",
};
