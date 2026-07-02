// Building-footprint occupancy — a fast, pure spatial query over the emitted city doc so AI
// systems (peds, traffic) can keep NPCs/cars out of building interiors. Built from the same
// collider footprints WorldColliders instantiates (tag !== "ground"), so "solid to physics" and
// "solid to AI" always agree. No THREE, no side-effects: render/city/store sets the index when the
// map generates; consumers import { isBuildingAt, resolveOutOfBuildings } and read it.
import type { CityMapDoc } from "./types";

interface Box {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

const CELL = 24; // spatial-hash cell (m)
const INDEX_PAD = 2; // index each box into cells within this many m (covers query margins)

let grid: Map<string, Box[]> | null = null;

const cellKey = (ix: number, iz: number): string => `${ix}:${iz}`;

/** Rebuild the footprint index from a city doc (or clear it with null). Call on map (re)generation. */
export function setBuildingIndex(doc: CityMapDoc | null): void {
  if (!doc) {
    grid = null;
    return;
  }
  const g = new Map<string, Box[]>();
  for (const c of doc.colliders) {
    if (c.tag === "ground") continue; // the ground slab isn't an obstacle
    const hx = c.halfExtents[0];
    const hz = c.halfExtents[2];
    // Conservative axis-aligned bounds of a (possibly yaw-rotated) footprint.
    const cos = Math.abs(Math.cos(c.rotationY || 0));
    const sin = Math.abs(Math.sin(c.rotationY || 0));
    const ax = hx * cos + hz * sin;
    const az = hx * sin + hz * cos;
    const box: Box = {
      x0: c.position[0] - ax,
      z0: c.position[2] - az,
      x1: c.position[0] + ax,
      z1: c.position[2] + az,
    };
    const i0 = Math.floor((box.x0 - INDEX_PAD) / CELL);
    const i1 = Math.floor((box.x1 + INDEX_PAD) / CELL);
    const j0 = Math.floor((box.z0 - INDEX_PAD) / CELL);
    const j1 = Math.floor((box.z1 + INDEX_PAD) / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = cellKey(i, j);
        let arr = g.get(k);
        if (!arr) g.set(k, (arr = []));
        arr.push(box);
      }
    }
  }
  grid = g;
}

/** True if (x,z) is inside any building/landmark footprint (expanded by `margin`). */
export function isBuildingAt(x: number, z: number, margin = 0): boolean {
  if (!grid) return false;
  const arr = grid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!arr) return false;
  for (const b of arr) {
    if (x >= b.x0 - margin && x <= b.x1 + margin && z >= b.z0 - margin && z <= b.z1 + margin) {
      return true;
    }
  }
  return false;
}

export interface SlideResult {
  x: number;
  z: number;
  blocked: boolean;
}

/**
 * Resolve a proposed move so it never ends INSIDE a building: if the target is clear, take it;
 * otherwise slide along whichever single axis is free (wall-slide); if both are blocked, stay put.
 * `margin` should be the agent's radius. Keeps kinematic AI on walkable ground around buildings.
 */
export function resolveOutOfBuildings(
  ox: number,
  oz: number,
  nx: number,
  nz: number,
  margin = 0,
): SlideResult {
  if (!isBuildingAt(nx, nz, margin)) return { x: nx, z: nz, blocked: false };
  if (!isBuildingAt(nx, oz, margin)) return { x: nx, z: oz, blocked: true }; // slide along X
  if (!isBuildingAt(ox, nz, margin)) return { x: ox, z: nz, blocked: true }; // slide along Z
  return { x: ox, z: oz, blocked: true }; // cornered → hold position
}
