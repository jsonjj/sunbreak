// Optional HUD ammo readout (weapon + mag/reserve). Narrow `useShallow` selector so only the
// numbers re-render, never the whole HUD tree. Mount standalone or via <InventoryOverlay/>.

import type { ReactElement } from "react";
import { useShallow } from "zustand/react/shallow";
import { useInventoryStore } from "../store";
import { WEAPONS } from "../catalog/weapons";
import { WeaponIcon } from "../catalog/icons";
import styles from "./weaponwheel.module.css";

export function AmmoCounter(): ReactElement | null {
  const view = useInventoryStore(
    useShallow((s) => {
      const def = s.equippedWeaponId ? WEAPONS[s.equippedWeaponId] : undefined;
      const inst = s.equippedWeaponId ? s.ownedWeapons[s.equippedWeaponId] : undefined;
      return {
        name: def?.name ?? null,
        icon: def?.icon ?? "handgun",
        isMelee: def ? def.ammoType === null : false,
        mag: inst?.mag ?? 0,
        reserve: def?.ammoType ? (s.ammo[def.ammoType] ?? 0) : 0,
      };
    }),
  );

  if (!view.name) return null;

  return (
    <div className={styles.ammoCounter} aria-live="polite">
      <span className={styles.ammoIcon}>
        <WeaponIcon icon={view.icon} size={26} />
      </span>
      <span className={styles.ammoText}>
        <span className={styles.ammoWeapon}>{view.name}</span>
        {view.isMelee ? (
          <span className={styles.ammoMelee}>Melee</span>
        ) : (
          <span className={styles.ammoNums}>
            <span className={styles.ammoClip}>{view.mag}</span>
            <span className={styles.ammoSep}>/</span>
            <span className={styles.ammoReserve}>{view.reserve}</span>
          </span>
        )}
      </span>
    </div>
  );
}
