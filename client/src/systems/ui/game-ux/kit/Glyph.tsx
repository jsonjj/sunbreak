// Input-prompt glyph. Renders a KBM keycap by default; when `pad` is set (and the store/input
// later reports a gamepad) the integrator can flip `mode` to show the button label instead.
import { cx } from "./cx";
import s from "./Glyph.module.css";

export interface GlyphProps {
  /** keyboard/mouse label, e.g. "E", "Esc", "LMB". */
  k: string;
  /** gamepad button label, e.g. "Ⓐ", "RB". */
  pad?: string;
  mode?: "kbm" | "pad";
  className?: string;
}

export function Glyph({ k, pad, mode = "kbm", className }: GlyphProps) {
  const label = mode === "pad" && pad ? pad : k;
  return <kbd className={cx(s.glyph, mode === "pad" && s.pad, className)}>{label}</kbd>;
}
