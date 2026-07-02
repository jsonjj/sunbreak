// 128 m tile bucketing, aligned to the world-streaming grid so the renderer can build/cull per
// tile and streaming can page tiles in/out. Pure helpers + a TileIndex assembler.
import { TILE_SIZE } from "./config";
import type {
  BuildingSpec,
  CityBounds,
  PropGroup,
  RoadNode,
  TileBucket,
  TileIndex,
} from "./types";

export interface TileGrid {
  size: number;
  cols: number;
  rows: number;
  originX: number;
  originZ: number;
}

export function makeTileGrid(bounds: CityBounds): TileGrid {
  const size = TILE_SIZE;
  const originX = Math.floor(bounds.min.x / size) * size;
  const originZ = Math.floor(bounds.min.z / size) * size;
  const cols = Math.max(1, Math.ceil((bounds.max.x - originX) / size));
  const rows = Math.max(1, Math.ceil((bounds.max.z - originZ) / size));
  return { size, cols, rows, originX, originZ };
}

const clampInt = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Tile id (row-major) containing world point (x, z), clamped to the grid. */
export function tileIdAt(g: TileGrid, x: number, z: number): number {
  const tx = clampInt(Math.floor((x - g.originX) / g.size), 0, g.cols - 1);
  const tz = clampInt(Math.floor((z - g.originZ) / g.size), 0, g.rows - 1);
  return tz * g.cols + tx;
}

/** Center world coordinate of a tile id. */
export function tileCenter(g: TileGrid, id: number): { x: number; z: number } {
  const tx = id % g.cols;
  const tz = Math.floor(id / g.cols);
  return { x: g.originX + (tx + 0.5) * g.size, z: g.originZ + (tz + 0.5) * g.size };
}

/** Tile ids whose centers lie within `radius` meters of (x, z). */
export function tilesNear(g: TileGrid, x: number, z: number, radius: number): number[] {
  const r = Math.ceil(radius / g.size) + 1;
  const cx = Math.floor((x - g.originX) / g.size);
  const cz = Math.floor((z - g.originZ) / g.size);
  const out: number[] = [];
  const r2 = radius * radius;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const tx = cx + dx;
      const tz = cz + dz;
      if (tx < 0 || tz < 0 || tx >= g.cols || tz >= g.rows) continue;
      const px = g.originX + (tx + 0.5) * g.size;
      const pz = g.originZ + (tz + 0.5) * g.size;
      const ddx = px - x;
      const ddz = pz - z;
      if (ddx * ddx + ddz * ddz <= r2) out.push(tz * g.cols + tx);
    }
  }
  return out;
}

/** Bucket every building / prop-group / road node into its tile. */
export function buildTileIndex(
  g: TileGrid,
  buildings: BuildingSpec[],
  props: PropGroup[],
  nodes: RoadNode[],
): TileIndex {
  const tiles: Record<number, TileBucket> = {};
  const bucket = (id: number): TileBucket => {
    let b = tiles[id];
    if (!b) {
      b = { buildings: [], props: [], nodes: [] };
      tiles[id] = b;
    }
    return b;
  };

  buildings.forEach((b, i) => bucket(b.tile).buildings.push(i));
  nodes.forEach((n) => bucket(tileIdAt(g, n.x, n.z)).nodes.push(n.id));

  // Coarse: record which prop groups have at least one instance in a tile.
  props.forEach((group, gi) => {
    const seen = new Set<number>();
    for (const t of group.tiles) {
      if (!seen.has(t)) {
        seen.add(t);
        bucket(t).props.push(gi);
      }
    }
  });

  return { size: g.size, cols: g.cols, rows: g.rows, originX: g.originX, originZ: g.originZ, tiles };
}
