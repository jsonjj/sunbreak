// The radial weapon wheel — a DOM/SVG overlay mounted as a sibling of <Canvas>. Conditionally
// rendered only while open (zero cost closed, never touches the WebGL loop). EXPORTED for the
// integrator to mount next to <HUD/>.

import type { ReactElement } from "react";
import { useShallow } from "zustand/react/shallow";
import { useInventoryStore } from "../store";
import type { WeaponCategory, WeaponDef } from "../types";
import { WEAPONS, WEAPON_LIST, WHEEL_CATEGORIES } from "../catalog/weapons";
import { firstOwnedInCategory } from "../rules";
import { WheelSegment } from "./WheelSegment";
import { useWheelInput } from "./useWheelInput";
import { WHEEL_R_INNER, WHEEL_R_OUTER, WHEEL_VIEWBOX } from "./geometry";
import styles from "./weaponwheel.module.css";

const CENTER = WHEEL_VIEWBOX / 2;

function representativeDef(cat: WeaponCategory): WeaponDef | undefined {
  return WEAPON_LIST.find((w) => w.category === cat);
}

const CATEGORY_LABEL: Record<WeaponCategory, string> = {
  melee: "Melee",
  handgun: "Sidearm",
  smg: "SMG",
  shotgun: "Shotgun",
  rifle: "Rifle",
  sniper: "Sniper",
  heavy: "Heavy",
  thrown: "Thrown",
};

/** Public component. Renders nothing unless the wheel is open. */
export function WeaponWheel(): ReactElement | null {
  const open = useInventoryStore((s) => s.wheelOpen);
  return open ? <WheelBody /> : null;
}

function WheelBody(): ReactElement {
  useWheelInput();
  const { hoverSlot, ownedWeapons, ammo, lastByCategory, equippedWeaponId } = useInventoryStore(
    useShallow((s) => ({
      hoverSlot: s.hoverSlot,
      ownedWeapons: s.ownedWeapons,
      ammo: s.ammo,
      lastByCategory: s.lastByCategory,
      equippedWeaponId: s.equippedWeaponId,
    })),
  );

  const select = (slot: number): void => {
    useInventoryStore.getState().setHover(slot);
    useInventoryStore.getState().closeWheel();
  };

  const segments = WHEEL_CATEGORIES.map((cat, slot) => {
    const currentId = lastByCategory[cat] ?? firstOwnedInCategory(ownedWeapons, cat) ?? undefined;
    const owned = currentId !== undefined && ownedWeapons[currentId] !== undefined;
    const def = (currentId ? WEAPONS[currentId] : undefined) ?? representativeDef(cat);
    if (!def) return null;
    const count = owned && def.ammoType ? (ammo[def.ammoType] ?? 0) : -1;
    return (
      <WheelSegment
        key={cat}
        slot={slot}
        center={CENTER}
        rInner={WHEEL_R_INNER}
        rOuter={WHEEL_R_OUTER}
        hovered={hoverSlot === slot}
        owned={owned}
        def={def}
        count={count}
        onSelect={select}
      />
    );
  });

  // Center readout previews the hovered category, falling back to what's equipped.
  const previewCat = hoverSlot >= 0 ? WHEEL_CATEGORIES[hoverSlot] : undefined;
  const previewId = previewCat
    ? (lastByCategory[previewCat] ?? firstOwnedInCategory(ownedWeapons, previewCat) ?? equippedWeaponId)
    : equippedWeaponId;
  const previewDef = previewId ? WEAPONS[previewId] : undefined;
  const previewInst = previewId ? ownedWeapons[previewId] : undefined;
  const previewOwned = previewId !== undefined && previewInst !== undefined;
  const reserve = previewDef?.ammoType ? (ammo[previewDef.ammoType] ?? 0) : 0;

  return (
    <div className={styles.overlay} role="dialog" aria-label="Weapon wheel">
      <div className={styles.backdrop} />
      <div className={styles.wheelWrap}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${WHEEL_VIEWBOX} ${WHEEL_VIEWBOX}`}
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx={CENTER}
            cy={CENTER}
            r={WHEEL_R_OUTER + 6}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={1}
          />
          {segments}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={WHEEL_R_INNER - 6}
            fill="rgba(10,12,20,0.55)"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        </svg>

        <div className={styles.center}>
          {previewCat && <div className={styles.centerCat}>{CATEGORY_LABEL[previewCat]}</div>}
          <div className={styles.centerWeapon}>
            {previewOwned ? (previewDef?.name ?? "—") : "Locked"}
          </div>
          {previewOwned && previewDef && previewDef.ammoType && (
            <div className={styles.centerAmmo}>
              <span className={styles.centerClip}>{previewInst?.mag ?? 0}</span>
              <span className={styles.centerSep}>/</span>
              <span className={styles.centerReserve}>{reserve}</span>
            </div>
          )}
          {previewOwned && previewDef && previewDef.ammoType === null && (
            <div className={styles.centerMelee}>Melee</div>
          )}
        </div>

        <div className={styles.hint}>
          <kbd>Tab</kbd> hold · <kbd>scroll</kbd> cycle · <kbd>1–8</kbd> quick-equip ·{" "}
          <kbd>R</kbd> reload
        </div>
      </div>
    </div>
  );
}
