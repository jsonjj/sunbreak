// One weapon-wheel wedge: donut segment + category glyph + optional ammo/count. Purely
// presentational; hover state and selection are driven by the parent.

import type { ReactElement } from "react";
import type { WeaponDef } from "../types";
import { WeaponGlyph } from "../catalog/icons";
import { pointOnCircle, wedgePath, SLOT_DEG } from "./geometry";
import styles from "./weaponwheel.module.css";

const ICON_SIZE = 46;

export interface WheelSegmentProps {
  slot: number;
  center: number;
  rInner: number;
  rOuter: number;
  hovered: boolean;
  owned: boolean;
  def: WeaponDef;
  /** Reserve/held count to show under the icon; < 0 hides it. */
  count: number;
  onSelect: (slot: number) => void;
}

export function WheelSegment({
  slot,
  center,
  rInner,
  rOuter,
  hovered,
  owned,
  def,
  count,
  onSelect,
}: WheelSegmentProps): ReactElement {
  const accent = def.accent ?? "#ff9d5c";
  const iconR = (rInner + rOuter) / 2;
  const [ix, iy] = pointOnCircle(center, center, iconR, slot * SLOT_DEG);
  const [lx, ly] = pointOnCircle(center, center, iconR + 28, slot * SLOT_DEG);

  const fill = hovered
    ? accent
    : owned
      ? "rgba(255,255,255,0.06)"
      : "rgba(255,255,255,0.022)";
  const stroke = hovered ? accent : owned ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)";
  const contentColor = hovered ? "#0b0d15" : owned ? "#f4f6fb" : "rgba(244,246,251,0.32)";

  return (
    <g
      onPointerDown={owned ? () => onSelect(slot) : undefined}
      style={{ cursor: owned ? "pointer" : "default", transition: "opacity 120ms ease" }}
    >
      <path
        d={wedgePath(center, center, rInner, rOuter, slot)}
        fill={fill}
        stroke={stroke}
        strokeWidth={hovered ? 2 : 1}
        style={{ transition: "fill 110ms ease, stroke 110ms ease" }}
      />
      <g
        transform={`translate(${ix - ICON_SIZE / 2} ${iy - ICON_SIZE / 2}) scale(${ICON_SIZE / 24})`}
        style={{ transition: "color 110ms ease", color: contentColor }}
      >
        <WeaponGlyph icon={def.icon} strokeWidth={hovered ? 1.9 : 1.7} />
      </g>
      {owned && count >= 0 && (
        <text
          x={lx}
          y={ly}
          textAnchor="middle"
          dominantBaseline="middle"
          className={styles.segCount}
          style={{ color: contentColor }}
        >
          {count}
        </text>
      )}
    </g>
  );
}
