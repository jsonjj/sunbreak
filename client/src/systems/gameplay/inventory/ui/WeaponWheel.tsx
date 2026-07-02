// The radial weapon wheel — a DOM/SVG overlay mounted as a sibling of <Canvas>. Conditionally
// rendered only while open (zero cost closed, never touches the WebGL loop). EXPORTED for the
// integrator to mount next to <HUD/>.
//
// It renders ONE segment per OWNED weapon (see layout.ts), reading everything from the shared
// `useInventoryStore` (owned weapons, ammo pools, equipped id, transient hover/open). Selecting a
// segment equips that weapon via the store's `equip(id)` action, which Combat mirrors each frame.
// Open/close reuse the store's existing `openWheel()` / `closeWheel()` — the integrator drives
// those from a key (see report); nothing here binds keys or mounts itself into the scene.

import type { CSSProperties, ReactElement, PointerEvent as ReactPointerEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { useInventoryStore } from "../store";
import type { WeaponCategory } from "../types";
import { WheelSegment } from "./WheelSegment";
import { WheelLabel } from "./WheelLabel";
import { useWheelInput } from "./useWheelInput";
import { ownedWheelEntries, type WheelEntry } from "./layout";
import {
  WHEEL_R_INNER,
  WHEEL_R_OUTER,
  WHEEL_VIEWBOX,
  pointOnCircle,
  pointerToIndex,
  pointerRadius,
  segmentCenterDeg,
  wheelOuterRadiusPx,
} from "./geometry";
import styles from "./weaponwheel.module.css";

const CENTER = WHEEL_VIEWBOX / 2;
const LABEL_R = (WHEEL_R_INNER + WHEEL_R_OUTER) / 2;

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
  const { hoverSlot, ownedWeapons, ammo, equippedWeaponId } = useInventoryStore(
    useShallow((s) => ({
      hoverSlot: s.hoverSlot,
      ownedWeapons: s.ownedWeapons,
      ammo: s.ammo,
      equippedWeaponId: s.equippedWeaponId,
    })),
  );

  const entries = ownedWheelEntries(ownedWeapons, ammo);
  const count = entries.length;
  useWheelInput(entries);

  // Equip the chosen weapon, then close via the store's existing mechanism. Setting hover to the
  // committed slot first keeps closeWheel()'s category read-back consistent with what we equipped.
  const commit = (entry: WheelEntry): void => {
    const st = useInventoryStore.getState();
    st.setHover(entry.slot);
    st.equip(entry.id);
    st.closeWheel();
  };

  // Close without changing the loadout (click center / outside / empty wheel).
  const cancel = (): void => {
    const st = useInventoryStore.getState();
    st.setHover(-1);
    st.closeWheel();
  };

  const onWheelPointerDown = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (count === 0) return cancel();
    const idx = pointerToIndex(e.clientX, e.clientY, count);
    const hit = idx >= 0 ? entries[idx] : undefined;
    if (!hit || pointerRadius(e.clientX, e.clientY) > wheelOuterRadiusPx()) return cancel();
    commit(hit);
  };

  // Center readout previews the hovered weapon, falling back to what's equipped.
  const hovered = hoverSlot >= 0 ? entries.find((en) => en.slot === hoverSlot) : undefined;
  const equipped = entries.find((en) => en.id === equippedWeaponId);
  const focus = hovered ?? equipped;

  return (
    <div className={styles.overlay} role="dialog" aria-label="Weapon wheel">
      <div className={styles.backdrop} onPointerDown={cancel} />
      <div className={styles.wheelWrap}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${WHEEL_VIEWBOX} ${WHEEL_VIEWBOX}`}
          xmlns="http://www.w3.org/2000/svg"
          onPointerDown={onWheelPointerDown}
        >
          {/* Full-disc transparent hit layer so angular gaps are still selectable. */}
          <circle cx={CENTER} cy={CENTER} r={WHEEL_R_OUTER} fill="transparent" />
          <circle
            className={styles.ringGuide}
            cx={CENTER}
            cy={CENTER}
            r={WHEEL_R_OUTER + 6}
            fill="none"
          />
          {entries.map((entry, i) => (
            <WheelSegment
              key={entry.id}
              index={i}
              count={count}
              center={CENTER}
              rInner={WHEEL_R_INNER}
              rOuter={WHEEL_R_OUTER}
              hovered={entry.slot === hoverSlot}
              equipped={entry.id === equippedWeaponId}
              accent={entry.accent}
            />
          ))}
          <circle className={styles.hub} cx={CENTER} cy={CENTER} r={WHEEL_R_INNER - 6} />
        </svg>

        <div className={styles.labels}>
          {entries.map((entry, i) => {
            const [lx, ly] = pointOnCircle(CENTER, CENTER, LABEL_R, segmentCenterDeg(i, count));
            return (
              <WheelLabel
                key={entry.id}
                entry={entry}
                leftPct={(lx / WHEEL_VIEWBOX) * 100}
                topPct={(ly / WHEEL_VIEWBOX) * 100}
                hovered={entry.slot === hoverSlot}
                equipped={entry.id === equippedWeaponId}
              />
            );
          })}
        </div>

        <div className={styles.center} style={{ "--accent": focus?.accent ?? "#ff9d5c" } as CSSProperties}>
          {focus ? (
            <>
              <div className={styles.centerCat}>{CATEGORY_LABEL[focus.def.category]}</div>
              <div className={styles.centerWeapon}>{focus.def.name}</div>
              {focus.isMelee ? (
                <div className={styles.centerMelee}>Melee</div>
              ) : (
                <div className={styles.centerAmmo}>
                  <span className={styles.centerClip}>{focus.mag}</span>
                  <span className={styles.centerSep}>/</span>
                  <span className={styles.centerReserve}>{focus.reserve}</span>
                </div>
              )}
            </>
          ) : (
            <div className={styles.centerWeapon}>No weapons</div>
          )}
        </div>

        <div className={styles.hint}>
          <span>
            <kbd>Click</kbd> equip
          </span>
          <span>
            <kbd>Scroll</kbd> cycle
          </span>
          <span>
            <kbd>1–8</kbd> quick-swap
          </span>
          <span>
            <kbd>R</kbd> reload
          </span>
        </div>
      </div>
    </div>
  );
}
