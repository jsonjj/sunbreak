// Bake the vector city into a single offscreen canvas ONCE (water → land features → roads →
// labels). The minimap then blits one transformed crop per frame and the full map blits it whole —
// the static city is never re-rasterised. The baked canvas doubles as the `drawImage` source.
import { PALETTE, PX_PER_M, ROAD_WIDTH_M, roadColor } from "./mapConstants";
import { BASEMAP_W, BASEMAP_H, centroid, worldToBasePx } from "./coords";
import { SANTA_VISTA_MAP } from "./mapData";
import type { Area, MapData, Road, RoadClass, Vec2 } from "./mapTypes";

let basemap: HTMLCanvasElement | null = null;

/** `CanvasRenderingContext2D.letterSpacing` is recent — set it only when supported. */
function setLetterSpacing(ctx: CanvasRenderingContext2D, value: string): void {
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = value;
}

/** The baked basemap (lazily rendered on first call). */
export function getBasemap(): HTMLCanvasElement {
  if (!basemap) basemap = bake(SANTA_VISTA_MAP);
  return basemap;
}

const CASING = 3;
const CLASS_ORDER: RoadClass[] = ["alley", "street", "arterial", "highway"];

function bake(map: MapData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = BASEMAP_W;
  canvas.height = BASEMAP_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Land base + a soft central lift for depth.
  ctx.fillStyle = PALETTE.land;
  ctx.fillRect(0, 0, BASEMAP_W, BASEMAP_H);
  const g = ctx.createRadialGradient(
    BASEMAP_W / 2,
    BASEMAP_H / 2,
    0,
    BASEMAP_W / 2,
    BASEMAP_H / 2,
    Math.max(BASEMAP_W, BASEMAP_H) * 0.62,
  );
  g.addColorStop(0, PALETTE.landEdge);
  g.addColorStop(1, PALETTE.land);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, BASEMAP_W, BASEMAP_H);

  // Areas, painted back-to-front.
  const order: Record<Area["kind"], number> = {
    water: 0,
    beach: 1,
    park: 2,
    block: 3,
    district: 4,
  };
  const areas = [...map.areas].sort((a, b) => order[a.kind] - order[b.kind]);
  for (const a of areas) fillArea(ctx, a);

  // Roads: casing pass, then colour pass ordered so highways sit on top.
  for (const r of map.roads) strokeRoad(ctx, r, ROAD_WIDTH_M[r.cls] * PX_PER_M + CASING, PALETTE.roadCasing);
  for (const cls of CLASS_ORDER) {
    for (const r of map.roads) {
      if (r.cls !== cls) continue;
      strokeRoad(ctx, r, ROAD_WIDTH_M[cls] * PX_PER_M, roadColor(cls));
    }
  }

  // Labels last so they stay legible over everything.
  for (const a of areas) labelArea(ctx, a);

  return canvas;
}

function fillArea(ctx: CanvasRenderingContext2D, area: Area): void {
  if (area.poly.length < 3) return;
  tracePoly(ctx, area.poly);
  switch (area.kind) {
    case "water":
      ctx.fillStyle = PALETTE.water;
      ctx.fill();
      ctx.strokeStyle = PALETTE.waterEdge;
      ctx.lineWidth = 3;
      ctx.stroke();
      break;
    case "beach":
      ctx.fillStyle = PALETTE.beach;
      ctx.fill();
      break;
    case "park":
      ctx.fillStyle = PALETTE.park;
      ctx.fill();
      break;
    case "district":
      ctx.fillStyle = PALETTE.districtFill;
      ctx.fill();
      ctx.strokeStyle = PALETTE.districtStroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    case "block":
      ctx.fillStyle = PALETTE.block;
      ctx.fill();
      break;
    default:
      break;
  }
}

function tracePoly(ctx: CanvasRenderingContext2D, poly: Vec2[]): void {
  ctx.beginPath();
  for (let i = 0; i < poly.length; i++) {
    const p = worldToBasePx(poly[i]!.x, poly[i]!.z);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

function strokeRoad(ctx: CanvasRenderingContext2D, road: Road, width: number, color: string): void {
  if (road.pts.length < 2) return;
  ctx.beginPath();
  for (let i = 0; i < road.pts.length; i++) {
    const p = worldToBasePx(road.pts[i]!.x, road.pts[i]!.z);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function labelArea(ctx: CanvasRenderingContext2D, area: Area): void {
  if (!area.name || area.kind === "block") return;
  const at = area.label ?? centroid(area.poly);
  const p = worldToBasePx(at.x, at.z);
  const size = area.kind === "water" ? 22 : area.kind === "district" ? 16 : 13;

  ctx.save();
  ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  setLetterSpacing(ctx, "2px");
  const text = area.name.toUpperCase();

  ctx.lineWidth = 3;
  ctx.strokeStyle = PALETTE.labelHalo;
  ctx.strokeText(text, p.x, p.y);
  ctx.fillStyle = area.kind === "water" ? "rgba(150,190,220,0.5)" : PALETTE.label;
  ctx.fillText(text, p.x, p.y);
  ctx.restore();
}
