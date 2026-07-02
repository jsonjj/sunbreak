// Street dressing: sidewalk ring segments (also the pedestrian polylines), instanced
// streetlights/trees/hydrants placed along block frontages with seeded spacing+jitter, and
// crosswalk metadata at major intersections. Transforms are packed as column-major 4×4
// matrices (THREE's native element order) so the renderer uploads them straight to the GPU.
import { SIDEWALK_WIDTH, STREETLIGHT_SPACING, TREE_SPACING } from "./config";
import { chance, deriveSeed, jitter, mulberry32, range } from "./prng";
import { dist, lerp, polygonBounds } from "./geo";
import { tileIdAt, type TileGrid } from "./tiling";
import type {
  BlockSpec,
  Crosswalk,
  PropGroup,
  PropType,
  RoadGraph,
  SidewalkSegment,
} from "./types";

export interface PropsResult {
  props: PropGroup[];
  sidewalks: SidewalkSegment[];
  crosswalks: Crosswalk[];
}

/** Accumulates instances for one prop type into a packed matrix buffer. */
class PropAccumulator {
  readonly matrices: number[] = [];
  readonly tiles: number[] = [];
  count = 0;
  constructor(readonly type: PropType) {}

  push(x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, tile: number): void {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    // Column-major T*R(y)*S.
    this.matrices.push(
      c * sx, 0, -s * sx, 0,
      0, sy, 0, 0,
      s * sz, 0, c * sz, 0,
      x, y, z, 1,
    );
    this.tiles.push(tile);
    this.count++;
  }

  toGroup(): PropGroup {
    return { type: this.type, count: this.count, matrices: this.matrices, tiles: this.tiles };
  }
}

const CORNER_N: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function buildProps(
  blocks: BlockSpec[],
  graph: RoadGraph,
  tileGrid: TileGrid,
  seed: number,
): PropsResult {
  const lights = new PropAccumulator("streetlight");
  const trees = new PropAccumulator("tree");
  const hydrants = new PropAccumulator("hydrant");
  const benches = new PropAccumulator("bench");
  const sidewalks: SidewalkSegment[] = [];

  for (const block of blocks) {
    const rng = mulberry32(deriveSeed(seed, `props:${block.id}`));
    const r = polygonBounds(block.poly);
    const corners: Array<readonly [number, number]> = [
      [r.x0, r.z0],
      [r.x1, r.z0],
      [r.x1, r.z1],
      [r.x0, r.z1],
    ];

    for (let e = 0; e < 4; e++) {
      const a = corners[e]!;
      const b = corners[(e + 1) % 4]!;
      const n = CORNER_N[e]!;
      const len = dist({ x: a[0], z: a[1] }, { x: b[0], z: b[1] });
      sidewalks.push({ a: { x: a[0], z: a[1] }, b: { x: b[0], z: b[1] }, width: SIDEWALK_WIDTH });

      const inwardYaw = Math.atan2(-n[0], -n[1]);

      const lightCount = Math.max(1, Math.floor(len / STREETLIGHT_SPACING));
      for (let k = 0; k < lightCount; k++) {
        const t = (k + 0.5) / lightCount;
        const px = lerp(a[0], b[0], t) + n[0] * 0.3;
        const pz = lerp(a[1], b[1], t) + n[1] * 0.3;
        lights.push(px, 0, pz, inwardYaw, 1, 1, 1, tileIdAt(tileGrid, px, pz));
      }

      const treeCount = Math.max(0, Math.floor(len / TREE_SPACING));
      for (let k = 0; k < treeCount; k++) {
        if (!chance(rng, 0.7)) continue;
        const t = (k + 0.5) / treeCount;
        const off = SIDEWALK_WIDTH * 0.6;
        const px = lerp(a[0], b[0], t) - n[0] * off + jitter(rng, 0.5);
        const pz = lerp(a[1], b[1], t) - n[1] * off + jitter(rng, 0.5);
        const sc = range(rng, 0.85, 1.4);
        trees.push(px, 0, pz, range(rng, 0, Math.PI * 2), sc, sc, sc, tileIdAt(tileGrid, px, pz));
      }
    }

    // Corner dressing.
    for (const c of corners) {
      if (chance(rng, 0.25)) {
        hydrants.push(c[0], 0, c[1], range(rng, 0, Math.PI * 2), 1, 1, 1, tileIdAt(tileGrid, c[0], c[1]));
      }
      if (chance(rng, 0.15)) {
        benches.push(c[0], 0, c[1], range(rng, 0, Math.PI * 2), 1, 1, 1, tileIdAt(tileGrid, c[0], c[1]));
      }
    }
  }

  // Crosswalks at intersections (node degree ≥ 3).
  const degree = new Map<number, number>();
  for (const ed of graph.edges) {
    degree.set(ed.a, (degree.get(ed.a) ?? 0) + 1);
    degree.set(ed.b, (degree.get(ed.b) ?? 0) + 1);
  }
  const crosswalks: Crosswalk[] = [];
  let cwId = 0;
  for (const node of graph.nodes) {
    if ((degree.get(node.id) ?? 0) < 3) continue;
    crosswalks.push({
      id: cwId++,
      node: node.id,
      at: { x: node.x, z: node.z },
      dir: 0,
      length: 12,
      width: 4,
    });
  }

  const props = [lights.toGroup(), trees.toGroup(), hydrants.toGroup(), benches.toGroup()].filter(
    (g) => g.count > 0,
  );

  return { props, sidewalks, crosswalks };
}
