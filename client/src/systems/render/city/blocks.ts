// Extract buildable city blocks from the road grid: each grid cell minus the surrounding
// half-road widths = the block interior. Blocks are tagged by district and dropped where a
// reserved landmark footprint sits.
import { hHalfWidth, vHalfWidth, type CityGrid } from "./roads";
import { landmarkReservesFootprint } from "./districts";
import {
  polygonBounds,
  rectArea,
  rectCentroid,
  rectPoly,
  rectsOverlap,
  pointInPolygon,
  type Rect,
} from "./geo";
import { tileIdAt, type TileGrid } from "./tiling";
import type { BlockSpec, DistrictKey, DistrictSpec, Landmark } from "./types";

const MIN_BLOCK_EDGE = 8; // meters — below this the "block" is just a road remnant.

function districtAt(x: number, z: number, districts: DistrictSpec[]): DistrictKey | null {
  for (const d of districts) if (pointInPolygon({ x, z }, d.poly)) return d.key;
  return null;
}

export function buildBlocks(
  grid: CityGrid,
  districts: DistrictSpec[],
  landmarks: Landmark[],
  tileGrid: TileGrid,
): BlockSpec[] {
  const reserved: Rect[] = landmarks
    .filter((l) => landmarkReservesFootprint(l.kind))
    .map((l) => polygonBounds(l.footprint));

  const blocks: BlockSpec[] = [];
  let id = 0;

  for (let j = 0; j < grid.nz - 1; j++) {
    for (let i = 0; i < grid.nx - 1; i++) {
      const x0 = grid.xs[i]! + vHalfWidth(grid, i);
      const x1 = grid.xs[i + 1]! - vHalfWidth(grid, i + 1);
      const z0 = grid.zs[j]! + hHalfWidth(grid, j);
      const z1 = grid.zs[j + 1]! - hHalfWidth(grid, j + 1);
      if (x1 - x0 < MIN_BLOCK_EDGE || z1 - z0 < MIN_BLOCK_EDGE) continue;

      const rect: Rect = { x0, z0, x1, z1 };
      const centroid = rectCentroid(rect);
      const district = districtAt(centroid.x, centroid.z, districts);
      if (!district) continue;

      if (reserved.some((r) => rectsOverlap(r, rect, 2))) continue;

      blocks.push({
        id: id++,
        tile: tileIdAt(tileGrid, centroid.x, centroid.z),
        district,
        poly: rectPoly(rect),
        centroid,
        area: rectArea(rect),
      });
    }
  }

  return blocks;
}
