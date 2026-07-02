// Uniform-grid spatial hash over live peds. Rebuilt once per update tick from `transform`
// positions, then queried by: internal separation/contagion, and externally by combat
// (raycast → nearby peds, since kinematic peds have NO Rapier colliders) and traffic (crosswalk
// yield). Arrays are pooled across frames → effectively zero steady-state allocation.

import type { ClientEntity } from "@/ecs/clientEntity";
import { pedQuery } from "./queries";

const CELL = 4; // metres
const OFF = 4096;
const STRIDE = OFF * 2 + 1;

const cells = new Map<number, ClientEntity[]>();
const spare: ClientEntity[][] = [];

const key = (x: number, z: number): number => {
  const i = Math.floor(x / CELL) + OFF;
  const j = Math.floor(z / CELL) + OFF;
  return i * STRIDE + j;
};

/** Rebuild the hash from current ped transforms. Call once per update, before queries. */
export function rebuildPedHash(): void {
  for (const arr of cells.values()) {
    arr.length = 0;
    spare.push(arr);
  }
  cells.clear();
  for (const e of pedQuery) {
    const t = e.transform;
    if (!t) continue;
    const k = key(t.position.x, t.position.z);
    let arr = cells.get(k);
    if (!arr) {
      arr = spare.pop() ?? [];
      cells.set(k, arr);
    }
    arr.push(e);
  }
}

/**
 * Invoke `cb` for every live ped whose centre is within `r` of (x,z). Zero-allocation — the hot
 * path for separation/contagion. `skip` (optional) is excluded (e.g. the querying ped itself).
 */
export function forEachPedNear(
  x: number,
  z: number,
  r: number,
  cb: (e: ClientEntity, d2: number) => void,
  skip?: ClientEntity,
): void {
  const r2 = r * r;
  const i0 = Math.floor((x - r) / CELL);
  const i1 = Math.floor((x + r) / CELL);
  const j0 = Math.floor((z - r) / CELL);
  const j1 = Math.floor((z + r) / CELL);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const arr = cells.get((i + OFF) * STRIDE + (j + OFF));
      if (!arr) continue;
      for (let n = 0; n < arr.length; n++) {
        const e = arr[n]!;
        if (e === skip) continue;
        const t = e.transform!;
        const dx = t.position.x - x;
        const dz = t.position.z - z;
        const d2 = dx * dx + dz * dz;
        if (d2 <= r2) cb(e, d2);
      }
    }
  }
}

/**
 * Collect live peds within `r` of (x,z). Allocates a fresh array (fine for occasional combat/
 * traffic queries; use `forEachPedNear` on hot paths). EXPOSED to sibling subsystems via the
 * public API — peds are the "hittable" surface for combat because they have no colliders.
 */
export function getPedsNear(x: number, z: number, r: number): ClientEntity[] {
  const out: ClientEntity[] = [];
  forEachPedNear(x, z, r, (e) => out.push(e));
  return out;
}

/** Nearest live ped to (x,z) within `r`, or null. */
export function nearestPed(x: number, z: number, r: number): ClientEntity | null {
  let best: ClientEntity | null = null;
  let bestD2 = Infinity;
  forEachPedNear(x, z, r, (e, d2) => {
    if (d2 < bestD2) {
      bestD2 = d2;
      best = e;
    }
  });
  return best;
}
