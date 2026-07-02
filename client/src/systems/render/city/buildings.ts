// Per-lot building recipes. Picks floors/materials/emissive by (district style, lot area,
// distance-to-core) and emits axis-aligned `BuildingSpec`s (boxes aligned to the street grid).
// "Dense core, wild edges": buildings taper down toward the map edge. Kit-bashed GLTF modules
// are assumed CC0 (see kitSet); the renderer builds proportional placeholder volumes today.
import { CITY_HALF, FLOOR_HEIGHT, LOT_SETBACK, MAX_BUILDINGS } from "./config";
import { chance, deriveSeed, mulberry32, pick, type Rng } from "./prng";
import {
  insetRect,
  polygonBounds,
  rectCentroid,
  rectDepth,
  rectWidth,
} from "./geo";
import type { BuildingSpec, DistrictSpec, DistrictStyle, LotSpec } from "./types";

const MIN_FOOTPRINT = 4; // meters

const coreFactor = (x: number, z: number): number => {
  const d = Math.hypot(x, z);
  return Math.max(0, 1 - d / (CITY_HALF * 1.15));
};

function chooseFloors(style: DistrictStyle, rng: Rng, core: number): number {
  const [lo, hi] = style.floorRange;
  const t = rng() * 0.5 + core * 0.5; // taller toward the core
  return Math.max(lo, Math.round(lo + (hi - lo) * t));
}

export function buildBuildings(
  lots: LotSpec[],
  districts: DistrictSpec[],
  seed: number,
): BuildingSpec[] {
  const styleByKey = new Map<string, DistrictStyle>();
  for (const d of districts) styleByKey.set(d.key, d.style);

  const buildings: BuildingSpec[] = [];

  for (const lot of lots) {
    if (buildings.length >= MAX_BUILDINGS) break;
    const style = styleByKey.get(lot.district);
    if (!style) continue;

    const rng = mulberry32(deriveSeed(seed, `bld:${lot.id}`));
    if (!chance(rng, style.density)) continue; // empty lot / parking / plaza

    const rect = insetRect(polygonBounds(lot.poly), LOT_SETBACK);
    const width = rectWidth(rect);
    const depth = rectDepth(rect);
    if (width < MIN_FOOTPRINT || depth < MIN_FOOTPRINT) continue;

    const center = rectCentroid(rect);
    const core = coreFactor(center.x, center.z);
    const floors = chooseFloors(style, rng, core);
    const height = floors * FLOOR_HEIGHT;

    const color = pick(rng, style.palette) ?? "#8a8f99";
    const emissive = style.emissive && chance(rng, 0.62);
    const glass = style.glass && width > 10 && depth > 10;
    const setbackTop = height > 42 && chance(rng, 0.6);

    buildings.push({
      id: `b${buildings.length}`,
      lotId: lot.id,
      tile: lot.tile,
      district: lot.district,
      center,
      width,
      depth,
      rotationY: 0, // axis-aligned to the street grid
      floors,
      height,
      kitSet: style.kitSet,
      style: lot.district,
      color,
      emissive,
      glass,
      setbackTop,
    });
  }

  return buildings;
}
