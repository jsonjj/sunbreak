// One weapon-wheel wedge — the donut slice only. Purely presentational: fill/stroke/glow come
// from CSS driven by `hovered` / `equipped`, tinted by the weapon's `--accent`. Content (icon +
// name + ammo) is drawn by <WheelLabel/> in the HTML layer above the SVG. Clicks are handled once
// at the SVG level (angle-based), so this element carries no pointer handlers.

import type { CSSProperties, ReactElement } from "react";
import { wedgePathN } from "./geometry";
import styles from "./weaponwheel.module.css";

export interface WheelSegmentProps {
  index: number;
  count: number;
  center: number;
  rInner: number;
  rOuter: number;
  hovered: boolean;
  equipped: boolean;
  accent: string;
}

export function WheelSegment({
  index,
  count,
  center,
  rInner,
  rOuter,
  hovered,
  equipped,
  accent,
}: WheelSegmentProps): ReactElement {
  const className = [
    styles.seg,
    equipped ? styles.segEquipped : "",
    hovered ? styles.segHover : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <path
      className={className}
      style={{ "--accent": accent } as CSSProperties}
      d={wedgePathN(center, center, rInner, rOuter, index, count)}
      fillRule={count <= 1 ? "evenodd" : "nonzero"}
    />
  );
}
