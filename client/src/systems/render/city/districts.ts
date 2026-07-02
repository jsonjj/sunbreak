// Hand-authored INPUT for the generator: map bounds, the district system, arterial spine
// lines, and hero landmark placements. The canonical layout (which district sits where, its
// style, and the landmark anchors) lives in ./geography — the single source of truth shared
// with render/environment + render/streaming so terrain/water/roads/buildings all agree.
// `generate.ts` fills everything around this procedurally.
import { CITY_HALF } from "./config";
import { DISTRICTS, buildLandmarks } from "./geography";
import { rectPoly } from "./geo";
import type { CityBounds, DistrictSpec, Landmark } from "./types";

export interface ArterialLines {
  /** world X coordinates promoted to vertical arterials. */
  x: number[];
  /** world Z coordinates promoted to horizontal arterials. */
  z: number[];
}

export interface DistrictsInput {
  bounds: CityBounds;
  districts: DistrictSpec[];
  arterials: ArterialLines;
  landmarks: Landmark[];
}

/** Build the authored city input from the canonical geography (deterministic; no RNG). */
export function authorDistricts(): DistrictsInput {
  const H = CITY_HALF;
  const bounds: CityBounds = { min: { x: -H, z: -H }, max: { x: H, z: H } };

  const districts: DistrictSpec[] = DISTRICTS.map((d) => ({
    key: d.key,
    name: d.name,
    poly: rectPoly({ x0: d.rect.x0, z0: d.rect.z0, x1: d.rect.x1, z1: d.rect.z1 }),
    style: {
      floorRange: d.floorRange,
      kitSet: d.kitSet,
      palette: d.palette,
      emissive: d.emissive,
      glass: d.glass,
      density: d.density,
      zone: d.zone,
    },
  }));

  // Arterial spine: a downtown cross + ring roads tying the outer districts into the core.
  const arterials: ArterialLines = { x: [-300, 0, 300], z: [-300, 0, 260] };

  const landmarks: Landmark[] = buildLandmarks();

  return { bounds, districts, arterials, landmarks };
}

/** Landmark kinds that reserve their footprint (blocks under them are dropped). */
export function landmarkReservesFootprint(kind: Landmark["kind"]): boolean {
  return kind === "tower" || kind === "stadium" || kind === "mall" || kind === "hangar";
}
