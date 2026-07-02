// <CombatOverlay/> — the combat HUD layer (DOM sibling of <Canvas>). Draws a crosshair that
// reflects the LIVE spread (widens with hip-fire/movement/recoil-bloom, tightens on ADS), a
// hitmarker that flashes on your hits (red on a kill), and floating damage numbers projected from
// the world hit point through the active camera. Everything updates imperatively in one rAF loop —
// it never re-renders React on the hot path.
//
// <CombatRig/> self-mounts this by default; the integrator may also mount it manually as a DOM
// sibling of <Canvas>. A module ownership guard makes duplicates harmless (only one animates).

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useInputStore } from "@/stores/input.store";
import { useHudStore } from "@/stores/hud.store";
import { queries } from "@/ecs/queries";
import { combatRuntime, reticle } from "../runtime";
import { onCombatDamage } from "../events";
import {
  DAMAGE_NUMBER_MS,
  DAMAGE_NUMBER_POOL,
  DAMAGE_NUMBER_RISE,
  HITMARKER_MS,
  RETICLE_MAX_GAP,
  RETICLE_MIN_GAP,
  RETICLE_PX_PER_DEG,
} from "../constants";
import styles from "./combatHud.module.css";

/** Only one overlay instance drives the visuals; extras stay dormant (invisible). */
let overlayOwner: symbol | null = null;

interface DmgSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  born: number;
}

const _proj = new THREE.Vector3();

export function CombatOverlay() {
  const ownId = useRef<symbol>(Symbol("combat-overlay"));
  const crossRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLSpanElement>(null);
  const botRef = useRef<HTMLSpanElement>(null);
  const leftRef = useRef<HTMLSpanElement>(null);
  const rightRef = useRef<HTMLSpanElement>(null);
  const hitRef = useRef<HTMLDivElement>(null);
  const dmgEls = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    // Claim ownership; a second overlay stays dormant so we never draw two crosshairs.
    if (overlayOwner !== null) return;
    const id = ownId.current;
    overlayOwner = id;

    const slots: DmgSlot[] = Array.from({ length: DAMAGE_NUMBER_POOL }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      born: 0,
    }));
    let dmgCursor = 0;
    let hitAt = -Infinity;
    let hitKill = false;

    const localNetId = (): number => queries.players.entities[0]?.netId ?? 1;

    const offDamage = onCombatDamage((e) => {
      if (e.attackerNetId !== localNetId()) return;
      const now = performance.now();
      hitAt = now;
      hitKill = e.lethal;

      const i = dmgCursor;
      dmgCursor = (dmgCursor + 1) % slots.length;
      const slot = slots[i]!;
      slot.active = true;
      slot.x = e.point.x;
      slot.y = e.point.y;
      slot.z = e.point.z;
      slot.born = now;
      const el = dmgEls.current[i];
      if (el) {
        el.textContent = String(Math.max(1, Math.round(e.amount)));
        const mod = e.lethal ? ` ${styles.kill}` : e.headshot ? ` ${styles.head}` : "";
        el.className = `${styles.dmg}${mod}`;
      }
    });

    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();

      // ── Crosshair ────────────────────────────────────────────────────────────
      const cross = crossRef.current;
      if (cross) {
        const locked = useInputStore.getState().locked;
        const inVehicle = useHudStore.getState().inVehicle;
        const show = locked && !inVehicle;
        cross.classList.toggle(styles.visible!, show && reticle.active);
        cross.classList.toggle(styles.dim!, show && !reticle.active);
        cross.classList.toggle(styles.ads!, reticle.ads);
        if (show) {
          const gap = Math.min(
            RETICLE_MAX_GAP,
            Math.max(RETICLE_MIN_GAP, RETICLE_MIN_GAP + reticle.spreadDeg * RETICLE_PX_PER_DEG + reticle.kick),
          );
          if (topRef.current) topRef.current.style.transform = `translate(0px, ${-gap}px)`;
          if (botRef.current) botRef.current.style.transform = `translate(0px, ${gap}px)`;
          if (leftRef.current) leftRef.current.style.transform = `translate(${-gap}px, 0px)`;
          if (rightRef.current) rightRef.current.style.transform = `translate(${gap}px, 0px)`;
        }
      }

      // ── Hitmarker ────────────────────────────────────────────────────────────
      const hm = hitRef.current;
      if (hm) {
        const t = (now - hitAt) / HITMARKER_MS;
        if (t >= 0 && t < 1) {
          hm.style.opacity = String(1 - t);
          hm.style.transform = `translate(-50%, -50%) scale(${1.35 - 0.35 * t})`;
          hm.classList.toggle(styles.kill!, hitKill);
        } else {
          hm.style.opacity = "0";
        }
      }

      // ── Floating damage numbers ──────────────────────────────────────────────
      const cam = combatRuntime.camera;
      const w = window.innerWidth;
      const h = window.innerHeight;
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i]!;
        const el = dmgEls.current[i];
        if (!el) continue;
        if (!s.active) continue;
        const t = (now - s.born) / DAMAGE_NUMBER_MS;
        if (t >= 1 || !cam) {
          s.active = false;
          el.style.opacity = "0";
          continue;
        }
        _proj.set(s.x, s.y + 0.4, s.z).project(cam);
        if (_proj.z > 1) {
          el.style.opacity = "0";
          continue;
        }
        const sx = (_proj.x * 0.5 + 0.5) * w;
        const sy = (-_proj.y * 0.5 + 0.5) * h - t * DAMAGE_NUMBER_RISE;
        el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
        el.style.opacity = String(1 - t * t);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      offDamage();
      if (overlayOwner === id) overlayOwner = null;
    };
  }, []);

  return (
    <div className={styles.overlay} aria-hidden="true">
      <div className={styles.crosshair} ref={crossRef}>
        <span className={`${styles.line} ${styles.v}`} ref={topRef} />
        <span className={`${styles.line} ${styles.v}`} ref={botRef} />
        <span className={`${styles.line} ${styles.h}`} ref={leftRef} />
        <span className={`${styles.line} ${styles.h}`} ref={rightRef} />
        <span className={styles.dot} />
      </div>

      <div className={styles.hitmarker} ref={hitRef}>
        <span className={`${styles.tick} ${styles.tl}`} />
        <span className={`${styles.tick} ${styles.tr}`} />
        <span className={`${styles.tick} ${styles.bl}`} />
        <span className={`${styles.tick} ${styles.br}`} />
      </div>

      {Array.from({ length: DAMAGE_NUMBER_POOL }, (_, i) => (
        <span
          key={i}
          className={styles.dmg}
          ref={(el) => {
            dmgEls.current[i] = el;
          }}
        />
      ))}
    </div>
  );
}
