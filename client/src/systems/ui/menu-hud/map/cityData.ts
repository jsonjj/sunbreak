// Bridge to the render/city road graph — the source of real roads / blocks / districts for the
// minimap + full map. We only READ render/city's stable public port (never edit it). The city doc
// is deterministic from a seed and generated once by the city subsystem; `ensureCityMap()` is a
// cheap no-op when it already exists (and generates it if we somehow render first).
import { cityStore, ensureCityMap } from "@/systems/render/city";
import type { CityMapDoc, MapData } from "@/systems/render/city";
import { pointInPoly } from "./geometry";

export type { CityMapDoc, MapData } from "@/systems/render/city";

export interface MapBounds {
  min: { x: number; z: number };
  max: { x: number; z: number };
}

/** The generated city document (ensures it exists). Null only if generation is unavailable. */
export function getCityDoc(): CityMapDoc | null {
  const existing = cityStore.map;
  if (existing) return existing;
  try {
    return ensureCityMap();
  } catch {
    return null;
  }
}

/** The 2D projection (roads as polylines, districts as areas, POIs). */
export function getMapData(): MapData | null {
  const doc = getCityDoc();
  return doc ? cityStore.mapData : null;
}

/** City extents (with a small margin so edge roads aren't clipped by the baked basemap). */
export function getBounds(margin = 40): MapBounds | null {
  const doc = getCityDoc();
  if (!doc) return null;
  const b = doc.bounds;
  return {
    min: { x: b.min.x - margin, z: b.min.z - margin },
    max: { x: b.max.x + margin, z: b.max.z + margin },
  };
}

/** District name containing a world point (for the minimap / map place readout). */
export function districtNameAt(x: number, z: number): string {
  const doc = getCityDoc();
  if (!doc) return "Santa Vista";
  for (const d of doc.districts) {
    if (pointInPoly(x, z, d.poly)) return d.name;
  }
  return "Santa Vista";
}
