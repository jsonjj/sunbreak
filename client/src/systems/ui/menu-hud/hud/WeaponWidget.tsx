import { useRef } from "react";
import { cx } from "../lib/cx";
import { WEAPON_LABEL } from "../lib/hudModel";
import { useHudStore } from "../lib/stores";
import { useHudTransient } from "../lib/useHudTransient";
import { weaponIcon } from "../lib/icons";
import styles from "../styles/hud.module.css";

const MELEE = new Set(["unarmed", "fists"]);

/** Bottom-right weapon + ammo. Weapon change is discrete (selector); the mag/reserve counts
 *  update transiently so firing/reloading never re-renders React. */
export function WeaponWidget() {
  const weapon = useHudStore((s) => s.weapon);
  const clipRef = useRef<HTMLSpanElement>(null);
  const reserveRef = useRef<HTMLSpanElement>(null);

  useHudTransient(
    (s) => s.ammoClip,
    (n) => {
      if (clipRef.current) clipRef.current.textContent = String(n);
    },
  );
  useHudTransient(
    (s) => s.ammoReserve,
    (n) => {
      if (reserveRef.current) reserveRef.current.textContent = String(n);
    },
  );

  if (!weapon) return null;
  const Icon = weaponIcon(weapon);
  const label = WEAPON_LABEL[weapon] ?? "Unarmed";
  const isMelee = MELEE.has(weapon);

  return (
    <div className={cx(styles.panel, styles.weapon)} role="group" aria-label={`Weapon: ${label}`}>
      <span className={styles.weaponIcon}>
        <Icon size={20} />
      </span>
      <div className={styles.weaponMeta}>
        <span className={styles.weaponName}>{label}</span>
        {!isMelee ? (
          <span className={styles.ammo}>
            <span ref={clipRef} className={styles.ammoClip}>
              0
            </span>
            <span className={styles.ammoSep}>/</span>
            <span ref={reserveRef} className={styles.ammoReserve}>
              0
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
