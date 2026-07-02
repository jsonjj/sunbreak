// Curated respawn destinations. Death → nearest hospital; busted → nearest police station.
// Coordinates are placeholders inside the v0 playfield; the WORLD subsystem can replace these
// with validated ground-height nodes later. Falls back to the v0 default spawn.

import { DEFAULT_SPAWN, type Vec3 } from "@sunbreak/shared";

export type RespawnKind = "hospital" | "policeStation";

export interface RespawnNode {
  district: string;
  hospital: Vec3;
  policeStation: Vec3;
}

export const RESPAWN_NODES: readonly RespawnNode[] = [
  {
    district: "Downtown",
    hospital: { x: 40, y: 2, z: 20 },
    policeStation: { x: -30, y: 2, z: 35 },
  },
  {
    district: "Harborside",
    hospital: { x: -120, y: 2, z: -80 },
    policeStation: { x: -90, y: 2, z: -140 },
  },
  {
    district: "Sunset Hills",
    hospital: { x: 160, y: 2, z: -60 },
    policeStation: { x: 210, y: 2, z: -30 },
  },
];

/** Single safe fallback if the node list is ever empty. */
export const SAFE_FALLBACK: Vec3 = {
  x: DEFAULT_SPAWN[0] ?? 0,
  y: DEFAULT_SPAWN[1] ?? 2,
  z: DEFAULT_SPAWN[2] ?? 0,
};

function planarDistSq(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

/** Nearest node of the given kind to `pos` (returns a fresh Vec3 copy — safe to mutate). */
export function nearest(pos: Vec3, kind: RespawnKind): Vec3 {
  let best: Vec3 = SAFE_FALLBACK;
  let bestDist = Infinity;
  for (const node of RESPAWN_NODES) {
    const point = node[kind];
    const d = planarDistSq(pos, point);
    if (d < bestDist) {
      bestDist = d;
      best = point;
    }
  }
  return { x: best.x, y: best.y, z: best.z };
}
