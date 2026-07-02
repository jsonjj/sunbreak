// Rotating minimap — a DOM <canvas> overlay (sibling of the R3F <Canvas>, NOT inside WebGL) driven
// by its own throttled RAF loop. Reads the player transform from the ECS, blits one rotated crop of
// the baked basemap, then draws the route + upright edge-clamped blips + the fixed player arrow.
// Export: mounted by the integrator inside the HUD.
import { useEffect, useRef } from "react";
import "./map.css";
import { getMapState, layerOfStyle, useMapStore } from "./mapStore";
import { readPlayerCam } from "./playerSource";
import { getBasemap } from "./mapBake";
import {
  bearingOf,
  clamp,
  compassWord,
  damp,
  dist,
  pointInPoly,
  worldToBasePx,
} from "./coords";
import {
  HEAT_COLOR,
  MAX_HEAT,
  MINIMAP_HZ,
  MINIMAP_MAX_DPR,
  MINIMAP_SIZE,
  PX_PER_M,
  ROUTE_COLOR,
  ROUTE_COLOR_CB,
  ROUTE_GLOW,
  ZOOM_MAX_M,
  ZOOM_MIN_M,
} from "./mapConstants";
import { drawCompass, drawHeatArc, drawPlayerArrow, drawRoute, northScreenAngle } from "./MapCore";
import { clampToRing, drawBlipIcon, resolveBlipColor } from "./blips";
import { SANTA_VISTA_MAP } from "./mapData";
import type { Blip } from "./mapTypes";

const RING_ACCENT = "#ff8a4c";

function currentDistrict(x: number, z: number): string {
  let fallback = "";
  for (const a of SANTA_VISTA_MAP.areas) {
    if (a.kind === "block") continue;
    if (a.name && pointInPoly(x, z, a.poly)) {
      if (a.kind === "district") return a.name;
      fallback = a.name;
    }
  }
  return fallback || "Santa Vista";
}

export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const srRef = useRef<HTMLDivElement>(null);

  const scale = useMapStore((s) => s.scale);
  const opacity = useMapStore((s) => s.opacity);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduceMotion =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let lastDraw = 0;
    let tPrev = performance.now();
    let lastText = 0;
    let zoomM = getMapState().zoomMeters;

    const waypointBlip: Blip = { id: "__wp", style: "waypoint", at: { x: 0, z: 0 } };

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      if (now - lastDraw < 1000 / MINIMAP_HZ) return;
      lastDraw = now;

      const dt = clamp((now - tPrev) / 1000, 0, 0.1);
      tPrev = now;

      const cssSize = canvas.clientWidth || MINIMAP_SIZE;
      const dpr = Math.min(typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1, MINIMAP_MAX_DPR);
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
      const st = getMapState();
      const cam = readPlayerCam();

      if (!cam.valid) {
        drawAcquiring(ctx, R);
        return;
      }

      // Auto/manual zoom → visible radius in metres, smoothed.
      const targetM = st.autoZoom ? clamp(52 + cam.speed * 7, ZOOM_MIN_M, ZOOM_MAX_M) : st.zoomMeters;
      zoomM = reduceMotion ? targetM : damp(zoomM, targetM, 6, dt);

      const pxPerM = R / zoomM;
      const basemapScale = pxPerM / PX_PER_M;
      const theta = st.northUp ? 0 : cam.heading;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);

      const toScreen = (wx: number, wz: number): { x: number; y: number } => {
        const ox = (wx - cam.x) * pxPerM;
        const oy = (wz - cam.z) * pxPerM;
        return { x: R + (ox * cos - oy * sin), y: R + (ox * sin + oy * cos) };
      };

      // ── Clipped map layer ──
      ctx.save();
      ctx.beginPath();
      ctx.arc(R, R, R, 0, Math.PI * 2);
      ctx.clip();

      const base = getBasemap();
      const ppx = worldToBasePx(cam.x, cam.z);
      ctx.save();
      ctx.translate(R, R);
      ctx.rotate(theta);
      ctx.scale(basemapScale, basemapScale);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(base, -ppx.x, -ppx.y);
      ctx.restore();

      if (st.route && st.route.ok && st.route.path.length > 1) {
        drawRoute(ctx, st.route.path, toScreen, {
          color: st.colorBlind ? ROUTE_COLOR_CB : ROUTE_COLOR,
          glow: ROUTE_GLOW,
          width: 4,
        });
      }

      drawBlips(ctx, R, st, cam.y, toScreen, now);

      // Waypoint marker (drawn even if not a stored blip).
      if (st.waypoint) {
        waypointBlip.at = st.waypoint;
        const s = toScreen(st.waypoint.x, st.waypoint.z);
        const ring = clampToRing(s.x - R, s.y - R, R, 10);
        drawBlipIcon(ctx, R + ring.x, R + ring.y, waypointBlip, {
          size: 6,
          colorBlind: st.colorBlind,
          clamped: ring.clamped,
          angle: ring.angle,
        });
      }

      drawPlayerArrow(ctx, R, R, st.northUp ? -cam.heading : 0, 7, resolveBlipColor("player", st.colorBlind));
      ctx.restore(); // end clip

      // ── Ring chrome ──
      drawHeatArc(ctx, R, R, R, st.heat, MAX_HEAT, HEAT_COLOR, now);
      drawCompass(ctx, R, R, R, northScreenAngle(theta), RING_ACCENT);

      // ── Text readouts (throttled) ──
      if (now - lastText > 250) {
        lastText = now;
        if (readoutRef.current) readoutRef.current.textContent = currentDistrict(cam.x, cam.z);
        if (srRef.current) {
          if (st.waypoint) {
            const d = Math.round(dist(cam.x, cam.z, st.waypoint.x, st.waypoint.z));
            const word = compassWord(bearingOf(st.waypoint.x - cam.x, st.waypoint.z - cam.z));
            srRef.current.textContent = `Waypoint ${d} metres ${word}.`;
          } else {
            srRef.current.textContent = `${currentDistrict(cam.x, cam.z)}.`;
          }
        }
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="map-minimap"
      style={{ width: MINIMAP_SIZE * scale, height: MINIMAP_SIZE * scale, opacity }}
    >
      <canvas ref={canvasRef} className="map-minimap__canvas" />
      <button
        type="button"
        className="map-minimap__expand"
        title="Open map (M)"
        aria-label="Open full map"
        onClick={() => getMapState().toggleFullscreen(true)}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden focusable="false">
          <path
            d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <div ref={readoutRef} className="map-minimap__readout">
        Santa Vista
      </div>
      <div ref={srRef} className="map-sr" role="status" aria-live="polite" />
    </div>
  );
}

function drawBlips(
  ctx: CanvasRenderingContext2D,
  R: number,
  st: ReturnType<typeof getMapState>,
  playerY: number,
  toScreen: (wx: number, wz: number) => { x: number; y: number },
  now: number,
): void {
  for (const b of st.blips.values()) {
    if (b.minimap === false) continue;
    const layer = layerOfStyle(b.style);
    if (layer && !st.layers[layer]) continue;

    const s = toScreen(b.at.x, b.at.z);
    const ring = clampToRing(s.x - R, s.y - R, R, 10);
    if (ring.clamped && b.clampToEdge === false) continue;

    drawBlipIcon(ctx, R + ring.x, R + ring.y, b, {
      size: 5,
      colorBlind: st.colorBlind,
      clamped: ring.clamped,
      angle: ring.angle,
      playerY,
      time: now,
    });
  }
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
