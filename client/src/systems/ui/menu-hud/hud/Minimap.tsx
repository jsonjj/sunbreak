import { useEffect, useRef } from "react";
import type { BlipKind } from "@sunbreak/shared";
import { toggleClass } from "../lib/cx";
import { playerQuery, hudBlipQuery } from "../lib/ecs";
import { yawFromQuat } from "../lib/quat";
import { useHudStore } from "../lib/stores";
import { useHudTransient } from "../lib/useHudTransient";
import styles from "../styles/hud.module.css";

const TAU = Math.PI * 2;
const RANGE = 105; // world metres from centre to rim
const FPS = 30;
const FRAME_MS = 1000 / FPS;

const BLIP_COLOR: Record<BlipKind, string> = {
  player: "#ffffff",
  mission: "#ffb85c",
  vehicle: "#4aa8ff",
  enemy: "#ff5a5f",
  shop: "#6fe0a6",
  waypoint: "#b98bff",
};

/**
 * Bottom-left rotating-cone radar. A DPR-aware 2D <canvas> redrawn on rAF (~30fps) reading
 * the player transform + blips straight from the ECS world and the HUD store — it never causes
 * a React render. North-up map with a heading player cone; wanted heat tints the rim.
 */
export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wantedRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ w: 188, h: 188, dpr: 1 });

  // wanted rim tint (transient, no re-render)
  useHudTransient(
    (s) => s.heat,
    (heat) => toggleClass(wantedRef.current, styles.on, heat > 0),
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth || 188;
      const h = canvas.clientHeight || 188;
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let last = 0;

    const drawBlip = (
      cx: number,
      cy: number,
      scale: number,
      radius: number,
      dxWorld: number,
      dzWorld: number,
      color: string,
      big: boolean,
    ) => {
      let sx = dxWorld * scale;
      let sy = dzWorld * scale;
      const dist = Math.hypot(sx, sy);
      const rim = radius - 7;
      const edge = dist > rim;
      if (edge && dist > 0) {
        const k = rim / dist;
        sx *= k;
        sy *= k;
      }
      const px = cx + sx;
      const py = cy + sy;
      const r = big ? 4.2 : 3.2;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, TAU);
      ctx.fillStyle = color;
      ctx.globalAlpha = edge ? 0.65 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.stroke();
    };

    const render = (t: number) => {
      raf = requestAnimationFrame(render);
      if (t - last < FRAME_MS) return;
      last = t;

      const { w, h, dpr } = sizeRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) / 2;
      const scale = radius / RANGE;

      // range rings + graticule (north-up)
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      for (const rr of [radius * 0.5, radius * 0.82]) {
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, TAU);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.stroke();

      const player = playerQuery.entities[0];
      if (!player) {
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, TAU);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fill();
        return;
      }

      const pos = player.transform.position;
      const px = pos.x;
      const pz = pos.z;
      const heading =
        typeof player.movement?.facing === "number"
          ? player.movement.facing
          : yawFromQuat(player.transform.rotation);

      // store blips (world coords)
      for (const b of useHudStore.getState().blips) {
        if (b.kind === "player") continue;
        drawBlip(cx, cy, scale, radius, b.x - px, b.z - pz, BLIP_COLOR[b.kind], b.kind === "mission");
      }
      // ECS-tagged blips (live positions)
      for (const e of hudBlipQuery.entities) {
        if (e.hud_blipHidden || !e.hud_blip) continue;
        const color = e.hud_blip.color ?? BLIP_COLOR[e.hud_blip.kind];
        drawBlip(
          cx,
          cy,
          scale,
          radius,
          e.transform.position.x - px,
          e.transform.position.z - pz,
          color,
          e.hud_blip.kind === "mission" || e.hud_blip.kind === "enemy",
        );
      }

      // player heading cone at centre
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(heading);
      ctx.beginPath();
      ctx.moveTo(0, -8.5);
      ctx.lineTo(6, 6.5);
      ctx.lineTo(0, 3.5);
      ctx.lineTo(-6, 6.5);
      ctx.closePath();
      ctx.fillStyle = "#ff8a5c";
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.stroke();
      ctx.restore();
    };

    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className={styles.radar} role="img" aria-label="Minimap">
      <canvas ref={canvasRef} className={styles.radarCanvas} />
      <div className={styles.radarVignette} />
      <div ref={wantedRef} className={styles.radarWanted} />
      <span className={styles.radarNorth}>N</span>
    </div>
  );
}
