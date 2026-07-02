import { useEffect, useRef } from "react";
import { input } from "@/input/InputManager";
import { getEnv } from "@/systems/gameplay/daynight";
import { useGameStore, useHudStore, useSettingsStore, useUiStore } from "../lib/stores";
import { IconMap } from "../lib/icons";
import styles from "../styles/hud.module.css";
import { readPlayerCam } from "../map/playerCam";
import { getBasemap, worldToBasePx } from "../map/basemap";
import { getHudMapState, tickRoute } from "../map/blipStore";
import { eachEcsBlip } from "../map/ecsBlips";
import { eachLegacyBlip } from "../map/legacyBlips";
import { districtNameAt } from "../map/cityData";
import {
  bearingOf,
  clamp,
  clampToRing,
  compassWord,
  damp,
  dist,
  formatDistance,
  northScreenAngle,
} from "../map/geometry";
import {
  drawBlip,
  drawCompass,
  drawHeatArc,
  drawPlayerArrow,
  drawRoute,
} from "../map/draw";
import {
  HEAT_COLOR,
  MAX_HEAT,
  ROUTE_COLOR,
  ROUTE_COLOR_CB,
  ROUTE_GLOW,
  ROUTE_GLOW_CB,
  ZOOM_MAX_M,
  ZOOM_MIN_M,
  blipColor,
} from "../map/palette";
import type { MapBlip } from "../map/types";

const HZ = 40;
const RING_ACCENT = "#ff8a4c";
const WP_BLIP: MapBlip = {
  id: "__wp",
  x: 0,
  z: 0,
  kind: "waypoint",
  waypointable: false,
  minimap: true,
  map: true,
  clampToEdge: true,
  priority: 999,
  sonar: false,
};

function readClock(): string | null {
  try {
    const env = getEnv();
    if (!env) return null;
    const h = env.hour % 24;
    const m = env.minute % 60;
    return `${h < 10 ? "0" : ""}${h}:${m < 10 ? "0" : ""}${m}`;
  } catch {
    return null;
  }
}

/**
 * GTA-style rotating minimap. A DPR-aware circular <canvas> driven by its own throttled RAF loop
 * (never causes a React render): blits one rotated crop of the baked city basemap, then draws the
 * GPS route, edge-clamped blips (store API + live ECS `hud_blip` entities), the waypoint, the fixed
 * player arrow, the pursuit-heat arc and a compass pip. North-up + zoom come from the map store.
 */
export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const placeRef = useRef<HTMLDivElement>(null);
  const srRef = useRef<HTMLDivElement>(null);

  const openMap = () => {
    useGameStore.getState().pause();
    useUiStore.getState().setPauseTab("map");
    input.releaseLock();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduceMotion =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let lastDraw = 0;
    let tPrev = performance.now();
    let lastText = 0;
    let zoomM = getHudMapState().zoomMeters;

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      if (now - lastDraw < 1000 / HZ) return;
      lastDraw = now;
      const dt = clamp((now - tPrev) / 1000, 0, 0.1);
      tPrev = now;

      const cssSize = canvas.clientWidth || 200;
      const dpr = Math.min(typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1, 2);
      const backing = Math.round(cssSize * dpr);
      if (canvas.width !== backing) {
        canvas.width = backing;
        canvas.height = backing;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssSize, cssSize);

      const R = cssSize / 2;
      const st = getHudMapState();
      const cam = readPlayerCam();
      const colorBlind = useSettingsStore.getState().accessibility.colorblind !== "none";
      const heat = useHudStore.getState().heat;

      tickRoute(dt);

      if (!cam.valid) {
        drawAcquiring(ctx, R);
        return;
      }

      const targetM = st.autoZoom
        ? clamp(52 + cam.speed * 7, ZOOM_MIN_M, ZOOM_MAX_M)
        : st.zoomMeters;
      zoomM = reduceMotion ? targetM : damp(zoomM, targetM, 6, dt);

      const pxPerM = R / zoomM;
      const theta = st.northUp ? 0 : cam.heading;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const toScreen = (wx: number, wz: number): { x: number; y: number } => {
        const ox = (wx - cam.x) * pxPerM;
        const oy = (wz - cam.z) * pxPerM;
        return { x: R + (ox * cos - oy * sin), y: R + (ox * sin + oy * cos) };
      };

      // ── Clipped, rotating map layer ──
      ctx.save();
      ctx.beginPath();
      ctx.arc(R, R, R, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = "#0b0e18";
      ctx.fillRect(0, 0, cssSize, cssSize);

      const base = getBasemap();
      if (base) {
        const ppx = worldToBasePx(base, cam.x, cam.z);
        const basemapScale = pxPerM / base.pxPerMeter;
        ctx.save();
        ctx.translate(R, R);
        ctx.rotate(theta);
        ctx.scale(basemapScale, basemapScale);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(base.canvas, -ppx.x, -ppx.y);
        ctx.restore();
      }

      if (st.route && st.route.ok && st.route.path.length > 1) {
        drawRoute(ctx, st.route.path, toScreen, {
          color: colorBlind ? ROUTE_COLOR_CB : ROUTE_COLOR,
          glow: colorBlind ? ROUTE_GLOW_CB : ROUTE_GLOW,
          width: 4,
          dashPhase: now / 26,
        });
      }

      const drawOne = (b: MapBlip): void => {
        if (b.minimap === false || b.kind === "player") return;
        const s = toScreen(b.x, b.z);
        const ring = clampToRing(s.x - R, s.y - R, R, 9);
        if (ring.clamped && b.clampToEdge === false) return;
        drawBlip(ctx, R + ring.x, R + ring.y, b, {
          size: 5,
          colorBlind,
          clamped: ring.clamped,
          angle: ring.angle,
          playerY: cam.y,
          time: now,
        });
      };
      for (const b of st.blips.values()) drawOne(b);
      eachEcsBlip(drawOne);
      eachLegacyBlip(drawOne);

      // Waypoint marker (drawn even though it isn't a stored blip).
      if (st.waypoint) {
        WP_BLIP.x = st.waypoint.x;
        WP_BLIP.z = st.waypoint.z;
        const s = toScreen(st.waypoint.x, st.waypoint.z);
        const ring = clampToRing(s.x - R, s.y - R, R, 10);
        drawBlip(ctx, R + ring.x, R + ring.y, WP_BLIP, {
          size: 6,
          colorBlind,
          clamped: ring.clamped,
          angle: ring.angle,
        });
      }

      // Player arrow: fixed pointing up in rotate mode; rotates to heading in north-up mode.
      drawPlayerArrow(ctx, R, R, st.northUp ? -cam.heading : 0, 7.5, blipColor("player", colorBlind));

      // ── Ring chrome (drawn inside the clip so nothing spills past the circular frame) ──
      drawHeatArc(ctx, R, R, R - 3, heat, MAX_HEAT, HEAT_COLOR, now);
      drawCompass(ctx, R, R, R - 10, northScreenAngle(theta), RING_ACCENT);
      ctx.restore(); // end clip

      // ── Throttled text readouts ──
      if (now - lastText > 260) {
        lastText = now;
        if (clockRef.current) {
          const clock = readClock();
          clockRef.current.textContent = clock ?? "";
        }
        if (placeRef.current) placeRef.current.textContent = districtNameAt(cam.x, cam.z);
        if (srRef.current) {
          if (st.waypoint) {
            const d = formatDistance(dist(cam.x, cam.z, st.waypoint.x, st.waypoint.z));
            const word = compassWord(bearingOf(st.waypoint.x - cam.x, st.waypoint.z - cam.z));
            srRef.current.textContent = `Waypoint ${d} ${word}. ${districtNameAt(cam.x, cam.z)}.`;
          } else {
            srRef.current.textContent = `${districtNameAt(cam.x, cam.z)}.`;
          }
        }
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={styles.minimap} role="img" aria-label="Minimap">
      <canvas ref={canvasRef} className={styles.minimapCanvas} />
      <div className={styles.minimapRing} aria-hidden />
      <span ref={clockRef} className={styles.minimapClock} aria-hidden />
      <button
        type="button"
        className={styles.minimapExpand}
        title="Open map (M)"
        aria-label="Open full map"
        onClick={openMap}
      >
        <IconMap size={14} />
      </button>
      <div ref={placeRef} className={styles.minimapReadout}>
        Santa Vista
      </div>
      <div ref={srRef} className={styles.minimapSr} role="status" aria-live="polite" />
    </div>
  );
}

function drawAcquiring(ctx: CanvasRenderingContext2D, R: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(R, R, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#0b0d12";
  ctx.fillRect(0, 0, R * 2, R * 2);
  ctx.fillStyle = "rgba(244,246,251,0.45)";
  ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("ACQUIRING GPS", R, R);
  ctx.restore();
}
