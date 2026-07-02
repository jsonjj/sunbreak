// Full-screen pause map — a DOM overlay (NOT WebGL) with pan / zoom / click-to-waypoint, POIs,
// blip-layer toggles, GPS route + ETA, fast-travel, and accessibility settings. Self-gates on
// `useMapStore().fullscreenOpen`; the integrator mounts it once and drives the flag from the pause
// shell's "Map" tab (or `toggleFullscreen`).
import { useEffect, useRef, useState } from "react";
import "./map.css";
import { getMapState, layerOfStyle, useMapStore } from "./mapStore";
import { readPlayerCam } from "./playerSource";
import { getBasemap } from "./mapBake";
import { BASEMAP_H, BASEMAP_W, basePxToWorld, clamp, worldToBasePx } from "./coords";
import { ROUTE_COLOR, ROUTE_COLOR_CB, ROUTE_GLOW, ZOOM_MAX_M, ZOOM_MIN_M } from "./mapConstants";
import { drawPlayerArrow, drawRoute } from "./MapCore";
import { drawBlipIcon, resolveBlipColor } from "./blips";
import { SANTA_VISTA_MAP } from "./mapData";
import type { BlipLayer, Poi, PoiType } from "./mapTypes";

interface PoiMeta {
  color: string;
  glyph: string;
}
const POI_META: Record<PoiType, PoiMeta> = {
  safehouse: { color: "#46d39a", glyph: "H" },
  shop: { color: "#8fd0ff", glyph: "$" },
  gas: { color: "#ffd166", glyph: "F" },
  hospital: { color: "#ff5470", glyph: "+" },
  garage: { color: "#cfd5e3", glyph: "G" },
  activity: { color: "#c792ff", glyph: "*" },
  property: { color: "#ffd166", glyph: "#" },
  fasttravel: { color: "#4c8cff", glyph: "T" },
  collectible: { color: "#ffe08a", glyph: "o" },
};

interface View {
  scale: number;
  ox: number;
  oy: number;
  fit: number;
  ready: boolean;
}

const LAYERS: { key: BlipLayer; label: string }[] = [
  { key: "mission", label: "Missions" },
  { key: "enemy", label: "Enemies" },
  { key: "police", label: "Police" },
  { key: "vehicle", label: "Vehicles" },
  { key: "friend", label: "Friends" },
  { key: "poi", label: "Points of interest" },
];

const LEGEND: { style: Parameters<typeof resolveBlipColor>[0]; label: string }[] = [
  { style: "player", label: "You" },
  { style: "waypoint", label: "Waypoint" },
  { style: "mission", label: "Mission" },
  { style: "enemy", label: "Enemy" },
  { style: "police", label: "Police" },
  { style: "friend", label: "Friend" },
  { style: "vehicle", label: "Vehicle" },
];

function formatEta(distanceM: number): string {
  const secs = distanceM / 9; // ~32 km/h average
  if (!isFinite(secs)) return "—";
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function PauseMap() {
  const open = useMapStore((s) => s.fullscreenOpen);
  const colorBlind = useMapStore((s) => s.colorBlind);
  const northUp = useMapStore((s) => s.northUp);
  const autoZoom = useMapStore((s) => s.autoZoom);
  const opacity = useMapStore((s) => s.opacity);
  const hudScale = useMapStore((s) => s.scale);
  const zoomMeters = useMapStore((s) => s.zoomMeters);
  const layers = useMapStore((s) => s.layers);
  const waypoint = useMapStore((s) => s.waypoint);
  const route = useMapStore((s) => s.route);
  // Subscribe so structural blip changes re-render the legend/panel.
  useMapStore((s) => s.blipVersion);
  const [, force] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const subtitleRef = useRef<HTMLSpanElement>(null);
  const view = useRef<View>({ scale: 1, ox: 0, oy: 0, fit: 1, ready: false });
  const drag = useRef({ active: false, x: 0, y: 0, moved: false });
  const selectedPoi = useRef<Poi | null>(null);

  // Recompute the fit whenever the map is (re)opened.
  useEffect(() => {
    if (open) view.current.ready = false;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const fitView = (cw: number, ch: number): void => {
      const fit = Math.min(cw / BASEMAP_W, ch / BASEMAP_H) * 0.92;
      view.current.fit = fit;
      view.current.scale = fit;
      view.current.ox = (cw - BASEMAP_W * fit) / 2;
      view.current.oy = (ch - BASEMAP_H * fit) / 2;
      view.current.ready = true;
    };

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
      if (canvas.width !== Math.round(cw * dpr)) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
        view.current.ready = false;
      }
      if (!view.current.ready) fitView(cw, ch);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const v = view.current;
      const st = getMapState();
      const cam = readPlayerCam();

      const toScreen = (wx: number, wz: number): { x: number; y: number } => {
        const p = worldToBasePx(wx, wz);
        return { x: v.ox + p.x * v.scale, y: v.oy + p.y * v.scale };
      };

      // Backdrop + basemap.
      ctx.fillStyle = "#07080d";
      ctx.fillRect(0, 0, cw, ch);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(getBasemap(), v.ox, v.oy, BASEMAP_W * v.scale, BASEMAP_H * v.scale);

      // POIs.
      if (st.layers.poi) {
        for (const poi of SANTA_VISTA_MAP.pois) {
          const s = toScreen(poi.at.x, poi.at.z);
          drawPoi(ctx, s.x, s.y, poi, v.scale > 0.55, selectedPoi.current?.id === poi.id);
        }
      }

      // Route.
      if (st.route && st.route.ok && st.route.path.length > 1) {
        drawRoute(ctx, st.route.path, toScreen, {
          color: st.colorBlind ? ROUTE_COLOR_CB : ROUTE_COLOR,
          glow: ROUTE_GLOW,
          width: 5,
        });
      }

      // Blips.
      for (const b of st.blips.values()) {
        if (b.fullmap === false) continue;
        const layer = layerOfStyle(b.style);
        if (layer && !st.layers[layer]) continue;
        const s = toScreen(b.at.x, b.at.z);
        if (s.x < -20 || s.y < -20 || s.x > cw + 20 || s.y > ch + 20) continue;
        drawBlipIcon(ctx, s.x, s.y, b, { size: 6, colorBlind: st.colorBlind, playerY: cam.valid ? cam.y : 0, time: now });
      }

      // Waypoint marker.
      if (st.waypoint) {
        const s = toScreen(st.waypoint.x, st.waypoint.z);
        drawBlipIcon(ctx, s.x, s.y, { id: "__wp", style: "waypoint", at: st.waypoint }, { size: 8, colorBlind: st.colorBlind });
      }

      // Player (full map is north-up → arrow rotates to heading).
      if (cam.valid) {
        const s = toScreen(cam.x, cam.z);
        drawPlayerArrow(ctx, s.x, s.y, -cam.heading, 9, resolveBlipColor("player", st.colorBlind));
      }

      if (subtitleRef.current && cam.valid) {
        subtitleRef.current.textContent = currentPlace(cam.x, cam.z);
      }
    };
    raf = requestAnimationFrame(frame);

    // Non-passive wheel so we can zoom-to-cursor without page scroll.
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const v = view.current;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const next = clamp(v.scale * factor, v.fit * 0.6, v.fit * 9);
      // Keep the point under the cursor fixed.
      v.ox = mx - (mx - v.ox) * (next / v.scale);
      v.oy = my - (my - v.oy) * (next / v.scale);
      v.scale = next;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") getMapState().toggleFullscreen(false);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;

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

    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const v = view.current;
    const world = basePxToWorld((mx - v.ox) / v.scale, (my - v.oy) / v.scale);

    // Snap to a nearby POI if the click lands on one.
    let hit: Poi | null = null;
    let bestPx = 16;
    for (const poi of SANTA_VISTA_MAP.pois) {
      const s = { x: v.ox + worldToBasePx(poi.at.x, poi.at.z).x * v.scale, y: v.oy + worldToBasePx(poi.at.x, poi.at.z).y * v.scale };
      const d = Math.hypot(s.x - mx, s.y - my);
      if (d < bestPx) {
        bestPx = d;
        hit = poi;
      }
    }
    selectedPoi.current = hit && hit.type === "fasttravel" ? hit : null;
    getMapState().setWaypoint(hit ? hit.at : world);
    force((n) => n + 1); // reveal the fast-travel card for the selected POI
  };

  const st = getMapState();
  const routeInfo = route && route.ok ? route : null;
  const ft = selectedPoi.current;

  return (
    <div className="map-pause" style={{ opacity }}>
      <div className="map-pause__scrim" onClick={() => st.toggleFullscreen(false)} />
      <div className="map-pause__frame">
        <header className="map-pause__head">
          <div>
            <div className="map-pause__kicker">Santa Vista</div>
            <h2 className="map-pause__title">
              City Map <span ref={subtitleRef} className="map-pause__place" />
            </h2>
          </div>
          <div className="map-pause__head-actions">
            <button type="button" className="map-btn" onClick={() => (view.current.ready = false)}>
              Fit
            </button>
            <button type="button" className="map-btn map-btn--ghost" aria-label="Close map" onClick={() => st.toggleFullscreen(false)}>
              Esc ✕
            </button>
          </div>
        </header>

        <div className="map-pause__body">
          <canvas
            ref={canvasRef}
            className="map-pause__canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (drag.current.active = false)}
          />

          <aside className="map-pause__panel">
            <section className="map-card">
              <div className="map-card__title">Waypoint</div>
              {waypoint ? (
                <>
                  <div className="map-route">
                    <div className="map-route__row">
                      <span>Distance</span>
                      <strong>{routeInfo ? `${(routeInfo.distance / 1000).toFixed(2)} km` : "—"}</strong>
                    </div>
                    <div className="map-route__row">
                      <span>ETA</span>
                      <strong>{routeInfo ? formatEta(routeInfo.distance) : "—"}</strong>
                    </div>
                    {route && !route.ok && <div className="map-route__warn">No road route found.</div>}
                  </div>
                  <button type="button" className="map-btn map-btn--primary" onClick={() => st.clearWaypoint()}>
                    Clear waypoint
                  </button>
                </>
              ) : (
                <p className="map-hint">Click anywhere on the map to drop a waypoint. Scroll to zoom, drag to pan.</p>
              )}
              {ft && (
                <button
                  type="button"
                  className="map-btn map-btn--travel"
                  onClick={() => {
                    st.requestFastTravel(ft.at, ft.name);
                    st.toggleFullscreen(false);
                  }}
                >
                  Fast travel → {ft.name}
                </button>
              )}
            </section>

            <section className="map-card">
              <div className="map-card__title">Layers</div>
              <div className="map-toggles">
                {LAYERS.map((l) => (
                  <label key={l.key} className="map-toggle">
                    <input type="checkbox" checked={layers[l.key]} onChange={(e) => st.toggleLayer(l.key, e.target.checked)} />
                    <span>{l.label}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="map-card">
              <div className="map-card__title">Legend</div>
              <div className="map-legend">
                {LEGEND.map((it) => (
                  <div key={it.style} className="map-legend__item">
                    <span className="map-legend__dot" style={{ background: resolveBlipColor(it.style, colorBlind) }} />
                    {it.label}
                  </div>
                ))}
              </div>
            </section>

            <section className="map-card">
              <div className="map-card__title">Settings</div>
              <label className="map-toggle">
                <input type="checkbox" checked={northUp} onChange={(e) => st.setNorthUp(e.target.checked)} />
                <span>North-up minimap</span>
              </label>
              <label className="map-toggle">
                <input type="checkbox" checked={autoZoom} onChange={(e) => st.setAutoZoom(e.target.checked)} />
                <span>Auto-zoom minimap</span>
              </label>
              <label className="map-toggle">
                <input type="checkbox" checked={colorBlind} onChange={(e) => st.setColorBlind(e.target.checked)} />
                <span>Colour-blind palette</span>
              </label>
              {!autoZoom && (
                <label className="map-slider">
                  <span>Minimap range · {Math.round(zoomMeters)} m</span>
                  <input
                    type="range"
                    min={ZOOM_MIN_M}
                    max={ZOOM_MAX_M}
                    value={zoomMeters}
                    onChange={(e) => st.setZoomMeters(Number(e.target.value))}
                  />
                </label>
              )}
              <label className="map-slider">
                <span>HUD opacity · {Math.round(opacity * 100)}%</span>
                <input type="range" min={20} max={100} value={Math.round(opacity * 100)} onChange={(e) => st.setOpacity(Number(e.target.value) / 100)} />
              </label>
              <label className="map-slider">
                <span>HUD scale · {Math.round(hudScale * 100)}%</span>
                <input type="range" min={70} max={160} value={Math.round(hudScale * 100)} onChange={(e) => st.setScale(Number(e.target.value) / 100)} />
              </label>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function currentPlace(x: number, z: number): string {
  for (const a of SANTA_VISTA_MAP.areas) {
    if (a.kind === "district" && a.name) {
      // cheap AABB test using polygon extents
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of a.poly) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
      if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) return `· ${a.name}`;
    }
  }
  return "";
}

function drawPoi(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  poi: Poi,
  showLabel: boolean,
  selected: boolean,
): void {
  const meta = POI_META[poi.type];
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(8,10,16,0.9)";
  ctx.fill();
  ctx.lineWidth = selected ? 2.5 : 1.6;
  ctx.strokeStyle = selected ? "#ffffff" : meta.color;
  ctx.stroke();

  ctx.fillStyle = meta.color;
  ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(meta.glyph, x, y + 0.5);

  if (showLabel) {
    ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(poi.name, x + 13, y + 0.5);
    ctx.fillStyle = "rgba(240,243,250,0.92)";
    ctx.fillText(poi.name, x + 13, y + 0.5);
  }
  ctx.restore();
}
