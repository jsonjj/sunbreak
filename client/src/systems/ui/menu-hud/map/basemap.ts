// Bake the vector city into ONE offscreen canvas (land → blocks → districts → roads → labels). The
// minimap blits one transformed crop per frame and the full map blits it whole — the static city is
// never re-rasterised. Rebakes only if the city doc (seed) changes. World is Three X/Z; the raster
// is north-up (−Z up): basemap px (0,0) = the NW corner (bounds.min).
import { getBounds, getCityDoc, getMapData } from "./cityData";
import type { MapBounds } from "./cityData";
import { PALETTE, ROAD_WIDTH_M, roadColor } from "./palette";
import type { MapRoadClass } from "./palette";
import { centroid } from "./geometry";
import type { Vec2 } from "./types";

/** Pixels per world metre for the baked raster. */
export const PX_PER_M = 1;
/** Hard cap on either basemap dimension (fill-rate + memory guard). */
const MAX_BASEMAP_PX = 2048;
const CASING = 3;
const CLASS_ORDER: MapRoadClass[] = ["alley", "street", "arterial", "highway"];

export interface Basemap {
  canvas: HTMLCanvasElement;
  bounds: MapBounds;
  width: number;
  height: number;
  /** Actual basemap pixels per world metre (folds in the cap-scale for very large cities). */
  pxPerMeter: number;
}

/** Minimal projection surface (a baked Basemap satisfies this). */
export type Projection = Pick<Basemap, "bounds" | "pxPerMeter">;

let current: Basemap | null = null;
let bakedKey = -1;

/** World metres → basemap pixels (top-left origin). */
export function worldToBasePx(p: Projection, x: number, z: number): { x: number; y: number } {
  return { x: (x - p.bounds.min.x) * p.pxPerMeter, y: (z - p.bounds.min.z) * p.pxPerMeter };
}

/** Basemap pixels → world metres (inverse of `worldToBasePx`). */
export function basePxToWorld(p: Projection, px: number, py: number): Vec2 {
  return { x: px / p.pxPerMeter + p.bounds.min.x, z: py / p.pxPerMeter + p.bounds.min.z };
}

/** The baked basemap (lazily rendered / rebaked when the city changes). Null before the city loads. */
export function getBasemap(): Basemap | null {
  const doc = getCityDoc();
  if (!doc) return null;
  if (current && bakedKey === doc.seed) return current;
  const baked = bake();
  if (baked) {
    current = baked;
    bakedKey = doc.seed;
  }
  return current;
}

function bake(): Basemap | null {
  if (typeof document === "undefined") return null;
  const bounds = getBounds();
  const mapData = getMapData();
  const doc = getCityDoc();
  if (!bounds || !mapData || !doc) return null;

  const wWorld = bounds.max.x - bounds.min.x;
  const hWorld = bounds.max.z - bounds.min.z;
  const scale = Math.min(1, MAX_BASEMAP_PX / (Math.max(wWorld, hWorld) * PX_PER_M));
  const width = Math.max(2, Math.round(wWorld * PX_PER_M * scale));
  const height = Math.max(2, Math.round(hWorld * PX_PER_M * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // The raster may be capped below 1px/m — fold that into the world→px transform.
  const s = PX_PER_M * scale;
  const toPx = (x: number, z: number): { x: number; y: number } => ({
    x: (x - bounds.min.x) * s,
    y: (z - bounds.min.z) * s,
  });

  // Land base + soft central lift for depth.
  ctx.fillStyle = PALETTE.land;
  ctx.fillRect(0, 0, width, height);
  const g = ctx.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.62,
  );
  g.addColorStop(0, PALETTE.landEdge);
  g.addColorStop(1, PALETTE.land);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  // City blocks — subtle fills + hairline edges give the map its "urban grain".
  ctx.lineWidth = 1;
  for (const b of doc.blocks) {
    tracePoly(ctx, b.poly, toPx);
    ctx.fillStyle = PALETTE.block;
    ctx.fill();
    ctx.strokeStyle = PALETTE.blockEdge;
    ctx.stroke();
  }

  // District tints.
  for (const a of mapData.areas) {
    if (a.kind !== "district") continue;
    tracePoly(ctx, a.poly, toPx);
    ctx.fillStyle = PALETTE.districtFill;
    ctx.fill();
    ctx.strokeStyle = PALETTE.districtStroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Roads: casing pass, then colour pass ordered so highways sit on top.
  for (const r of mapData.roads) {
    strokeRoad(ctx, r.pts, ROAD_WIDTH_M[r.cls as MapRoadClass] * s + CASING, PALETTE.roadCasing, toPx);
  }
  for (const cls of CLASS_ORDER) {
    for (const r of mapData.roads) {
      if (r.cls !== cls) continue;
      strokeRoad(ctx, r.pts, ROAD_WIDTH_M[cls] * s, roadColor(cls), toPx);
    }
  }

  // District labels last so they stay legible over everything.
  for (const a of mapData.areas) {
    if (a.kind !== "district" || !a.name) continue;
    labelAt(ctx, a.name.toUpperCase(), a.label ?? centroid(a.poly), toPx, 15);
  }

  return { canvas, bounds, width, height, pxPerMeter: s };
}

function tracePoly(
  ctx: CanvasRenderingContext2D,
  poly: Vec2[],
  toPx: (x: number, z: number) => { x: number; y: number },
): void {
  ctx.beginPath();
  if (poly.length < 3) return;
  for (let i = 0; i < poly.length; i++) {
    const p = toPx(poly[i]!.x, poly[i]!.z);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

function strokeRoad(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  width: number,
  color: string,
  toPx: (x: number, z: number) => { x: number; y: number },
): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = toPx(pts[i]!.x, pts[i]!.z);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.6, width);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: string): void {
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = value;
}

function labelAt(
  ctx: CanvasRenderingContext2D,
  text: string,
  at: Vec2,
  toPx: (x: number, z: number) => { x: number; y: number },
  size: number,
): void {
  const p = toPx(at.x, at.z);
  ctx.save();
  ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  setLetterSpacing(ctx, "2px");
  ctx.lineWidth = 3;
  ctx.strokeStyle = PALETTE.labelHalo;
  ctx.strokeText(text, p.x, p.y);
  ctx.fillStyle = PALETTE.label;
  ctx.fillText(text, p.x, p.y);
  ctx.restore();
}
