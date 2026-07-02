// Per-segment content — weapon icon + name + ammo (mag / reserve). Rendered as an absolutely
// positioned HTML node over the SVG wedge (crisp DOM typography + truncation). The whole label
// layer is pointer-events:none so clicks pass through to the SVG hit layer; hover/equipped state
// only restyles it. Position is a percentage of the square wheel so it scales with the wheel.

import type { CSSProperties, ReactElement } from "react";
import { WeaponIcon } from "../catalog/icons";
import type { WheelEntry } from "./layout";
import styles from "./weaponwheel.module.css";

export interface WheelLabelProps {
  entry: WheelEntry;
  /** Center position as a percentage of the wheel box. */
  leftPct: number;
  topPct: number;
  hovered: boolean;
  equipped: boolean;
}

export function WheelLabel({
  entry,
  leftPct,
  topPct,
  hovered,
  equipped,
}: WheelLabelProps): ReactElement {
  const style = {
    left: `${leftPct}%`,
    top: `${topPct}%`,
    "--accent": entry.accent,
  } as CSSProperties;

  return (
    <div
      className={styles.label}
      style={style}
      data-focus={hovered || equipped ? "" : undefined}
      data-hovered={hovered ? "" : undefined}
      data-equipped={equipped ? "" : undefined}
    >
      <span className={styles.labelIcon}>
        <WeaponIcon icon={entry.def.icon} size={22} />
      </span>
      <span className={styles.labelName}>{entry.def.name}</span>
      {entry.isMelee ? (
        <span className={styles.labelMelee}>Melee</span>
      ) : (
        <span className={styles.labelAmmo}>
          <b>{entry.mag}</b>
          <i>/</i>
          <s>{entry.reserve}</s>
        </span>
      )}
    </div>
  );
}
