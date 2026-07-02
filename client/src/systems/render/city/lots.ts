// Parcel subdivision: inset each block for the sidewalk, then recursively split the buildable
// area (OBB = longer-axis split with a jittered cut) into lots inside [LOT_MIN_AREA, LOT_MAX_AREA].
// Each lot records its frontage heading (toward the road) + zone/style from its district.
import { LOT_MAX_AREA, LOT_MIN_AREA, SIDEWALK_WIDTH } from "./config";
import { deriveSeed, jitter, mulberry32, type Rng } from "./prng";
import {
  insetRect,
  lerp,
  polygonBounds,
  rectArea,
  rectCentroid,
  rectDepth,
  rectPoly,
  rectWidth,
  type Rect,
} from "./geo";
import type { BlockSpec, DistrictSpec, DistrictStyle, LotSpec, Vec2, Zone } from "./types";

const MIN_LOT_EDGE = 10; // meters

function subdivide(rect: Rect, rng: Rng, out: Rect[]): void {
  const w = rectWidth(rect);
  const d = rectDepth(rect);
  if (w <= 0 || d <= 0) return;
  const area = w * d;

  const canSplitW = w >= MIN_LOT_EDGE * 2;
  const canSplitD = d >= MIN_LOT_EDGE * 2;
  if (area <= LOT_MAX_AREA || (!canSplitW && !canSplitD)) {
    if (area >= LOT_MIN_AREA * 0.6) out.push(rect);
    return;
  }

  const t = 0.5 + jitter(rng, 0.14);
  const splitAlongW = canSplitW && (w >= d || !canSplitD);
  if (splitAlongW) {
    const xm = lerp(rect.x0, rect.x1, t);
    subdivide({ x0: rect.x0, z0: rect.z0, x1: xm, z1: rect.z1 }, rng, out);
    subdivide({ x0: xm, z0: rect.z0, x1: rect.x1, z1: rect.z1 }, rng, out);
  } else {
    const zm = lerp(rect.z0, rect.z1, t);
    subdivide({ x0: rect.x0, z0: rect.z0, x1: rect.x1, z1: zm }, rng, out);
    subdivide({ x0: rect.x0, z0: zm, x1: rect.x1, z1: rect.z1 }, rng, out);
  }
}

function frontageHeading(lot: Vec2, block: Vec2): number {
  const dx = lot.x - block.x;
  const dz = lot.z - block.z;
  if (Math.abs(dx) < 1e-3 && Math.abs(dz) < 1e-3) return 0;
  return Math.atan2(dx, dz);
}

export function buildLots(
  blocks: BlockSpec[],
  districts: DistrictSpec[],
  seed: number,
): LotSpec[] {
  const styleByKey = new Map<string, DistrictStyle>();
  for (const d of districts) styleByKey.set(d.key, d.style);

  const lots: LotSpec[] = [];

  for (const block of blocks) {
    const style = styleByKey.get(block.district);
    if (!style) continue;
    const rng = mulberry32(deriveSeed(seed, `lots:${block.id}`));

    const rect = polygonBounds(block.poly);
    const buildable = insetRect(rect, SIDEWALK_WIDTH);
    if (rectWidth(buildable) < MIN_LOT_EDGE || rectDepth(buildable) < MIN_LOT_EDGE) continue;

    const parcels: Rect[] = [];
    subdivide(buildable, rng, parcels);

    parcels.forEach((p, k) => {
      const centroid = rectCentroid(p);
      const zone: Zone = style.zone;
      lots.push({
        id: `${block.id}:${k}`,
        block: block.id,
        tile: block.tile,
        district: block.district,
        poly: rectPoly(p),
        centroid,
        area: rectArea(p),
        frontage: frontageHeading(centroid, block.centroid),
        zone,
        style: style.kitSet,
      });
    });
  }

  return lots;
}
