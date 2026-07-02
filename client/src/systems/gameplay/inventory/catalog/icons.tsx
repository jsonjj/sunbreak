// Original inline-SVG line-art glyphs (24x24, stroke = currentColor). Zero external assets, so
// there is nothing to attribute and nothing to load. Render inside any <svg> via <WeaponGlyph/>.

import type { ReactElement, ReactNode } from "react";

const GLYPHS: Record<string, ReactNode> = {
  handgun: (
    <>
      <rect x={3} y={7} width={15} height={4} rx={1} />
      <path d="M9 11 L8 18 H11 L12 11" />
      <line x1={6} y1={11} x2={6} y2={13} />
    </>
  ),
  smg: (
    <>
      <rect x={3} y={7} width={13} height={3} rx={1} />
      <line x1={16} y1={8.5} x2={21} y2={8.5} />
      <path d="M8 10 L7 15 H10 L11 10" />
      <path d="M12 10 V16 H14 V10" />
    </>
  ),
  shotgun: (
    <>
      <line x1={3} y1={8} x2={21} y2={8} />
      <rect x={8} y={9} width={6} height={2} rx={1} />
      <path d="M3 8 L1 12 H3" />
    </>
  ),
  rifle: (
    <>
      <line x1={3} y1={8} x2={20} y2={8} />
      <path d="M3 7 V11" />
      <path d="M9 9 L8 13" />
      <path d="M11 9 C 11 13, 13 13, 13 15" />
      <rect x={6} y={6} width={2} height={2} />
    </>
  ),
  sniper: (
    <>
      <line x1={2} y1={9} x2={21} y2={9} />
      <rect x={8} y={5} width={6} height={2} rx={1} />
      <line x1={10} y1={7} x2={10} y2={9} />
      <path d="M2 9 L1 12" />
      <path d="M18 9 L17 13 M18 9 L19 13" />
    </>
  ),
  heavy: (
    <>
      <rect x={3} y={8} width={16} height={5} rx={2.5} />
      <path d="M3 8 L1 6 M3 13 L1 15" />
      <path d="M19 8 L22 10.5 L19 13" />
      <path d="M10 13 L9 17" />
    </>
  ),
  thrown: (
    <>
      <circle cx={12} cy={14} r={5} />
      <rect x={10} y={6} width={4} height={3} rx={1} />
      <path d="M14 7 L18 6" />
      <circle cx={8.5} cy={6} r={1.5} />
    </>
  ),
  melee: (
    <>
      <path d="M4 14 L15 3 L17 5 L6 16 Z" />
      <path d="M6 16 L3 19" />
      <line x1={5} y1={13} x2={7} y2={15} />
    </>
  ),
  health: (
    <>
      <rect x={4} y={4} width={16} height={16} rx={4} />
      <line x1={12} y1={8} x2={12} y2={16} />
      <line x1={8} y1={12} x2={16} y2={12} />
    </>
  ),
  medkit: (
    <>
      <rect x={3} y={7} width={18} height={12} rx={2} />
      <path d="M9 7 V5 H15 V7" />
      <line x1={12} y1={10} x2={12} y2={16} />
      <line x1={9} y1={13} x2={15} y2={13} />
    </>
  ),
  armor: (
    <>
      <path d="M12 3 L20 6 V12 C 20 17, 16 20, 12 21 C 8 20, 4 17, 4 12 V6 Z" />
      <path d="M9 12 L11 14 L15 10" />
    </>
  ),
};

const FALLBACK: ReactNode = <circle cx={12} cy={12} r={7} />;

export interface WeaponGlyphProps {
  icon: string;
  /** Extra stroke width; base is 1.7. */
  strokeWidth?: number;
}

/** SVG <g> glyph in a 0..24 coordinate box. Color follows `currentColor`. */
export function WeaponGlyph({ icon, strokeWidth = 1.7 }: WeaponGlyphProps): ReactElement {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[icon] ?? FALLBACK}
    </g>
  );
}

/** Standalone icon wrapped in its own <svg> — handy for DOM/HUD usage. */
export function WeaponIcon({
  icon,
  size = 20,
  className,
}: {
  icon: string;
  size?: number;
  className?: string;
}): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <WeaponGlyph icon={icon} />
    </svg>
  );
}
