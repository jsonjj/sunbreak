import { useEffect, useRef } from "react";
import { cx } from "../lib/cx";
import { useHudMapStore, setWaypoint, clearWaypoint } from "../map/blipStore";
import { useSettingsStore } from "../lib/stores";
import { getBasemap, basePxToWorld, worldToBasePx } from "../map/basemap";
import type { Basemap } from "../map/basemap";
import { getMapData } from "../map/cityData";
import { readPlayerCam } from "../map/playerCam";
import { collectEcsBlips } from "../map/ecsBlips";
import { collectLegacyBlips } from "../map/legacyBlips";
import { clamp, formatDistance, formatEta } from "../map/geometry";
import { drawBlip, drawPlayerArrow, drawRoute } from "../map/draw";
import {
  LAYER_LABELS,
  ROUTE_COLOR,
  ROUTE_COLOR_CB,
  ROUTE_GLOW,
  ROUTE_GLOW_CB,
  blipColor,
  layerOf,
} from "../map/palette";
import type { BlipLayer, MapBlip, Vec2 } from "../map/types";
import styles from "../styles/map.module.css";

interface View {
  scale: number;
  ox: number;
  oy: number;
  fit: number;
  ready: boolean;
}

type PoiType = "safehouse" | "shop" | "landmark" | "spawn" | "fasttravel";
const POI_META: Partial<Record<PoiType, { color: string; glyph: string }>> = {
  landmark: { color: "#ffce6b", glyph: "◆" },
  safehouse: { color: "#4ad991", glyph: "H" },
  shop: { color: "#8fd0ff", glyph: "$" },
  fasttravel: { color: "#4c8cff", glyph: "T" },
};

const LAYERS: BlipLayer[] = ["mission", "shop", "activity", "vehicle", "police"];

/**
 * The interactive city map (used by the pause "Map" tab). Pan (drag), zoom (wheel to cursor),
 * click-to-set-waypoint (snaps to nearby POIs/blips), a live legend with layer toggles, and a
 * route/ETA bar. Draws the baked city basemap + the store/ECS blips + the GPS route.
 */
export function MapView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const layers = useHudMapStore((s) => s.layers);
  const northUp = useHudMapStore((s) => s.northUp);
  const autoZoom = useHudMapStore((s) => s.autoZoom);
  const waypoint = useHudMapStore((s) => s.waypoint);
  const waypointLabel = useHudMapStore((s) => s.waypointLabel);
  const route = useHudMapStore((s) => s.route);
  useHudMapStore((s) => s.routeVersion);
  const colorBlind = useSettingsStore((s) => s.accessibility.colorblind !== "none");

  const view = useRef<View>({ scale: 1, ox: 0, oy: 0, fit: 1, ready: false });
  const drag = useRef({ active: false, x: 0, y: 0, moved: false });

  const fitView = (base: Basemap, cw: number, ch: number): void => {
    const fit = Math.min(cw / base.width, ch / base.height) * 0.94;
    view.current = {
      fit,
      scale: fit,
      ox: (cw - base.width * fit) / 2,
      oy: (ch - base.height * fit) / 2,
      ready: true,
    };
  };

  const centerOnPlayer = (): void => {
    const base = getBasemap();
    const cam = readPlayerCam();
    const canvas = canvasRef.current;
    if (!base || !cam.valid || !canvas) return;
    const v = view.current;
    v.scale = clamp(v.fit * 3.2, v.fit * 0.6, v.fit * 9);
    const p = worldToBasePx(base, cam.x, cam.z);
    v.ox = canvas.clientWidth / 2 - p.x * v.scale;
    v.oy = canvas.clientHeight / 2 - p.y * v.scale;
    v.ready = true;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    let last = 0;

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      if (now - last < 1000 / 45) return;
      last = now;

      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (cw === 0 || ch === 0) return;
      const dpr = Math.min(typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1, 2);
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
        view.current.ready = false;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = "#07080d";
      ctx.fillRect(0, 0, cw, ch);

      const base = getBasemap();
      if (!base) {
        ctx.fillStyle = "rgba(244,246,251,0.5)";
        ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Loading map…", cw / 2, ch / 2);
        return;
      }
      if (!view.current.ready) fitView(base, cw, ch);

      const v = view.current;
      const st = useHudMapStore.getState();
      const cbNow = useSettingsStore.getState().accessibility.colorblind !== "none";
      const cam = readPlayerCam();
      const toScreen = (wx: number, wz: number): { x: number; y: number } => {
        const p = worldToBasePx(base, wx, wz);
        return { x: v.ox + p.x * v.scale, y: v.oy + p.y * v.scale };
      };

      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(base.canvas, v.ox, v.oy, base.width * v.scale, base.height * v.scale);

      // City POIs (base map context).
      const data = getMapData();
      if (data) {
        for (const poi of data.pois) {
          const meta = POI_META[poi.type as PoiType];
          if (!meta) continue;
          const s = toScreen(poi.at.x, poi.at.z);
          if (s.x < -30 || s.y < -30 || s.x > cw + 30 || s.y > ch + 30) continue;
          drawPoi(ctx, s.x, s.y, meta.color, meta.glyph, poi.name, v.scale > v.fit * 1.8);
        }
      }

      // Route.
      if (st.route && st.route.ok && st.route.path.length > 1) {
        drawRoute(ctx, st.route.path, toScreen, {
          color: cbNow ? ROUTE_COLOR_CB : ROUTE_COLOR,
          glow: cbNow ? ROUTE_GLOW_CB : ROUTE_GLOW,
          width: 5,
          dashPhase: now / 22,
        });
      }

      // Blips (store + live ECS), respecting layer toggles + `map` flag.
      const drawOne = (b: MapBlip): void => {
        if (b.map === false || b.kind === "player") return;
        const layer = layerOf(b.kind);
        if (layer && !st.layers[layer]) return;
        const s = toScreen(b.x, b.z);
        if (s.x < -30 || s.y < -30 || s.x > cw + 30 || s.y > ch + 30) return;
        drawBlip(ctx, s.x, s.y, b, {
          size: 6.5,
          colorBlind: cbNow,
          playerY: cam.valid ? cam.y : undefined,
          time: now,
          selected: st.selectedId === b.id,
          glyph: v.scale > v.fit * 1.4,
          label: v.scale > v.fit * 2.4,
        });
      };
      for (const b of st.blips.values()) drawOne(b);
      for (const b of collectEcsBlips()) drawOne(b);
      for (const b of collectLegacyBlips()) drawOne(b);

      // Waypoint.
      if (st.waypoint) {
        const s = toScreen(st.waypoint.x, st.waypoint.z);
        drawBlip(
          ctx,
          s.x,
          s.y,
          {
            id: "__wp",
            x: st.waypoint.x,
            z: st.waypoint.z,
            kind: "waypoint",
            waypointable: false,
            minimap: true,
            map: true,
            clampToEdge: false,
            priority: 999,
            sonar: false,
          },
          { size: 9, colorBlind: cbNow },
        );
      }

      // Player (north-up → arrow rotates to heading).
      if (cam.valid) {
        const s = toScreen(cam.x, cam.z);
        drawPlayerArrow(ctx, s.x, s.y, -cam.heading, 10, blipColor("player", cbNow));
      }
    };

    raf = requestAnimationFrame(frame);

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const v = view.current;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const next = clamp(v.scale * factor, v.fit * 0.6, v.fit * 9);
      v.ox = mx - (mx - v.ox) * (next / v.scale);
      v.oy = my - (my - v.oy) * (next / v.scale);
      v.scale = next;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { active: true, x: e.clientX, y: e.clientY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true;
    view.current.ox += dx;
    view.current.oy += dy;
    drag.current.x = e.clientX;
    drag.current.y = e.clientY;
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const wasDrag = drag.current.moved;
    drag.current.active = false;
    if (wasDrag) return;

    const base = getBasemap();
    if (!base) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const v = view.current;
    const world = basePxToWorld(base, (mx - v.ox) / v.scale, (my - v.oy) / v.scale);

    // Snap to the nearest waypointable blip / POI within a screen threshold.
    const st = useHudMapStore.getState();
    let best: { at: Vec2; id: string | null; label: string | null } | null = null;
    let bestPx = 18;
    const consider = (at: Vec2, id: string | null, label: string | null): void => {
      const p = worldToBasePx(base, at.x, at.z);
      const sx = v.ox + p.x * v.scale;
      const sy = v.oy + p.y * v.scale;
      const d = Math.hypot(sx - mx, sy - my);
      if (d < bestPx) {
        bestPx = d;
        best = { at: { x: at.x, z: at.z }, id, label };
      }
    };
    for (const b of st.blips.values()) {
      if (b.waypointable === false || b.map === false) continue;
      consider({ x: b.x, z: b.z }, b.id, b.label ?? null);
    }
    const data = getMapData();
    if (data) for (const poi of data.pois) if (POI_META[poi.type as PoiType]) consider(poi.at, `poi:${poi.id}`, poi.name);

    const picked = best as { at: Vec2; id: string | null; label: string | null } | null;
    st.setSelected(picked?.id ?? null);
    setWaypoint(picked ? picked.at : { x: world.x, z: world.z }, picked?.label ?? undefined);
  };

  const st = useHudMapStore.getState();
  const routeInfo = route && route.ok ? route : null;

  return (
    <div className={styles.mapView}>
      <div ref={wrapRef} className={styles.canvasWrap}>
        <canvas
          ref={canvasRef}
          className={cx(styles.canvas, drag.current.active && styles.dragging)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (drag.current.active = false)}
        />

        <div className={styles.controls}>
          <div className={styles.ctrlGroup}>
            <button
              type="button"
              className={styles.ctrlBtn}
              aria-label="Zoom out"
              onClick={() => zoomBy(view, canvasRef.current, 0.75)}
            >
              −
            </button>
            <button
              type="button"
              className={styles.ctrlBtn}
              aria-label="Zoom in"
              onClick={() => zoomBy(view, canvasRef.current, 1.33)}
            >
              +
            </button>
          </div>
          <div className={styles.ctrlGroup}>
            <button type="button" className={styles.ctrlBtn} onClick={() => (view.current.ready = false)}>
              Fit
            </button>
            <button type="button" className={styles.ctrlBtn} onClick={centerOnPlayer}>
              Me
            </button>
          </div>
          <div className={styles.ctrlGroup}>
            <button
              type="button"
              className={cx(styles.ctrlBtn, northUp && styles.on)}
              title="North-up minimap"
              onClick={() => st.toggleNorthUp()}
            >
              N↑
            </button>
            <button
              type="button"
              className={cx(styles.ctrlBtn, autoZoom && styles.on)}
              title="Auto-zoom minimap"
              onClick={() => st.setAutoZoom(!autoZoom)}
            >
              Auto
            </button>
          </div>
        </div>

        <div className={styles.legend}>
          <div className={styles.legendTitle}>Legend</div>
          <div className={styles.legendGrid}>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: blipColor("player", colorBlind) }} />
              You
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: blipColor("waypoint", colorBlind) }} />
              Waypoint
            </span>
            {LAYERS.map((l) => (
              <button
                key={l}
                type="button"
                className={cx(styles.legendItem, !layers[l] && styles.off)}
                onClick={() => st.toggleLayer(l)}
                aria-pressed={layers[l]}
              >
                <span
                  className={styles.legendDot}
                  style={{ background: blipColor(legendKind(l), colorBlind) }}
                />
                {LAYER_LABELS[l]}
              </button>
            ))}
          </div>
        </div>

        {waypoint ? (
          <div className={styles.routeBar}>
            <div className={styles.routeStat}>
              <span className={styles.routeStatLabel}>Distance</span>
              <span className={styles.routeStatValue}>
                {routeInfo ? formatDistance(routeInfo.distance) : "—"}
              </span>
            </div>
            <div className={styles.routeStat}>
              <span className={styles.routeStatLabel}>ETA</span>
              <span className={styles.routeStatValue}>
                {routeInfo ? formatEta(routeInfo.distance) : "—"}
              </span>
            </div>
            {waypointLabel ? <span className={styles.routeName}>{waypointLabel}</span> : null}
            <button
              type="button"
              className={styles.routeClear}
              aria-label="Clear waypoint"
              onClick={() => clearWaypoint()}
            >
              ✕
            </button>
          </div>
        ) : (
          <div className={styles.hint}>Click to set a waypoint · scroll to zoom · drag to pan</div>
        )}
      </div>
    </div>
  );
}

function legendKind(layer: BlipLayer): "mission" | "shop" | "activity" | "vehicle" | "police" {
  return layer;
}

function zoomBy(view: React.MutableRefObject<View>, canvas: HTMLCanvasElement | null, factor: number): void {
  if (!canvas) return;
  const v = view.current;
  const cx0 = canvas.clientWidth / 2;
  const cy0 = canvas.clientHeight / 2;
  const next = clamp(v.scale * factor, v.fit * 0.6, v.fit * 9);
  v.ox = cx0 - (cx0 - v.ox) * (next / v.scale);
  v.oy = cy0 - (cy0 - v.oy) * (next / v.scale);
  v.scale = next;
}

function drawPoi(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  glyph: string,
  name: string,
  showLabel: boolean,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 8.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(8,10,16,0.9)";
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = "800 10px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, x, y + 0.5);
  if (showLabel) {
    ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(name, x + 12, y + 0.5);
    ctx.fillStyle = "rgba(240,243,250,0.92)";
    ctx.fillText(name, x + 12, y + 0.5);
  }
  ctx.restore();
}
