import { useRef } from "react";
import { cx, toggleClass } from "../lib/cx";
import { clamp01 } from "../lib/format";
import { HUD_MAX } from "../lib/hudModel";
import { useHudTransient } from "../lib/useHudTransient";
import { IconHeart, IconShield, IconBolt, IconSpark } from "../lib/icons";
import styles from "../styles/hud.module.css";

/**
 * Bottom-left vitals. Health/armor/stamina/ability update transiently via `transform:
 * scaleX()` — zero React re-renders while they change. Armor + ability rows collapse when
 * empty; health pulses red when critical.
 */
export function HealthArmorBars() {
  const hp = useRef<HTMLDivElement>(null);
  const armor = useRef<HTMLDivElement>(null);
  const armorRow = useRef<HTMLDivElement>(null);
  const stamina = useRef<HTMLDivElement>(null);
  const ability = useRef<HTMLDivElement>(null);
  const abilityRow = useRef<HTMLDivElement>(null);

  useHudTransient(
    (s) => clamp01(s.health / HUD_MAX.health),
    (r) => {
      if (hp.current) hp.current.style.transform = `scaleX(${r})`;
      toggleClass(hp.current, styles.low, r <= 0.25);
    },
  );
  useHudTransient(
    (s) => clamp01(s.armor / HUD_MAX.armor),
    (r) => {
      if (armor.current) armor.current.style.transform = `scaleX(${r})`;
      if (armorRow.current) armorRow.current.style.display = r <= 0 ? "none" : "";
    },
  );
  useHudTransient(
    (s) => clamp01(s.stamina / HUD_MAX.stamina),
    (r) => {
      if (stamina.current) stamina.current.style.transform = `scaleX(${r})`;
    },
  );
  useHudTransient(
    (s) => clamp01(s.ability),
    (r) => {
      if (ability.current) ability.current.style.transform = `scaleX(${r})`;
      if (abilityRow.current) abilityRow.current.style.display = r <= 0 ? "none" : "";
    },
  );

  return (
    <div className={cx(styles.panel, styles.vitals)} role="group" aria-label="Vitals">
      <div className={styles.vitalRow}>
        <span className={styles.vitalIcon}>
          <IconHeart size={15} />
        </span>
        <div className={styles.track}>
          <div ref={hp} className={cx(styles.fill, styles.fillHp)} />
        </div>
      </div>

      <div ref={armorRow} className={styles.vitalRow} style={{ display: "none" }}>
        <span className={styles.vitalIcon}>
          <IconShield size={14} />
        </span>
        <div className={cx(styles.track, styles.trackThin)}>
          <div ref={armor} className={cx(styles.fill, styles.fillArmor)} />
        </div>
      </div>

      <div className={styles.vitalRow}>
        <span className={styles.vitalIcon}>
          <IconBolt size={14} />
        </span>
        <div className={cx(styles.track, styles.trackThin)}>
          <div ref={stamina} className={cx(styles.fill, styles.fillStamina)} />
        </div>
      </div>

      <div ref={abilityRow} className={styles.vitalRow} style={{ display: "none" }}>
        <span className={styles.vitalIcon}>
          <IconSpark size={14} />
        </span>
        <div className={cx(styles.track, styles.trackThin)}>
          <div ref={ability} className={cx(styles.fill, styles.fillAbility)} />
        </div>
      </div>
    </div>
  );
}
