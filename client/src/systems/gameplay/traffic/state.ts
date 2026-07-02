// Module-level singleton state for the traffic subsystem. Everything the systems + the R3F bridge
// need to share lives here (one graph, one accumulator, one view snapshot, loose-coupled provider
// hooks, a THREE-object pool). No React on the hot path — imperative, zero per-frame allocation.
import type * as THREE from "three";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { createCarObject, recolorCarObject } from "./carModel";
import { COS_HALF_FOV } from "./config";
import { mulberry32, type Rng } from "./prng";
import type { CarjackSpec, LaneGraph, RoadGraphInput } from "./types";

export interface ViewSnapshot {
  hasCamera: boolean;
  camX: number;
  camY: number;
  camZ: number;
  fwdX: number;
  fwdZ: number;
  /** Spawn/despawn + reaction centre (player world position). */
  px: number;
  py: number;
  pz: number;
  /** Player planar velocity estimate (m/s), derived from transform deltas. */
  pvx: number;
  pvz: number;
}

/** Loose-coupled hooks so we never import another agent's in-flight folder. Integrator wires these. */
export interface TrafficProviders {
  /** Current wanted level, 0..5. */
  wanted: (() => number) | null;
  /** Is a police siren near (x,z)? Used to trigger pull-over. */
  sirenNear: ((x: number, z: number) => boolean) | null;
  /** vehicle-gameplay spawner invoked on carjack (optional; ECS handoff works without it). */
  spawnVehicle: ((spec: CarjackSpec) => void) | null;
  /** wanted-police crime reporter for player-caused crashes (optional). */
  reportCrime: ((x: number, z: number, kind: string) => void) | null;
}

export interface Governor {
  capScale: number; // 0.4..1 multiplier on the population cap
  dtEma: number; // smoothed frame dt (s)
}

interface PooledGroup {
  group: THREE.Group;
  freeAt: number; // performance.now() timestamp after which reuse is safe
}

class TrafficState {
  graph: LaneGraph | null = null;
  graphSource: "provided" | "discovered" | "procedural" = "procedural";
  providedRoads: RoadGraphInput | null = null;
  ready = false;
  /** True only while <TrafficView/> is mounted — keeps traffic 100% inert until the integrator
   *  opts in, so it can NEVER disturb the v0 scene. */
  enabled = false;
  forceHeadless = false; // test hook to run the sim without a view

  accumulator = 0;
  alpha = 0; // render-interpolation remainder in [0,1)
  spawnClock = 0;
  frame = 0;

  rng: Rng = mulberry32(0xc0ffee);

  view: ViewSnapshot = {
    hasCamera: false,
    camX: 0,
    camY: 60,
    camZ: 0,
    fwdX: 0,
    fwdZ: -1,
    px: 0,
    py: 0,
    pz: 0,
    pvx: 0,
    pvz: 0,
  };

  providers: TrafficProviders = {
    wanted: null,
    sirenNear: null,
    spawnVehicle: null,
    reportCrime: null,
  };

  governor: Governor = { capScale: 1, dtEma: 1 / 60 };

  private pool: PooledGroup[] = [];
  createdGroups = 0;

  /** Reuse a cooled-down pooled car group (recoloured) or build a fresh one. */
  acquireGroup(colorHex: number): THREE.Group {
    const now = performance.now();
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i]!;
      if (now >= p.freeAt) {
        this.pool.splice(i, 1);
        recolorCarObject(p.group, colorHex);
        p.group.visible = true;
        return p.group;
      }
    }
    this.createdGroups++;
    return createCarObject(colorHex);
  }

  /** Return a car group to the pool with a short cooldown so React can't double-mount it. */
  releaseGroup(group: THREE.Group): void {
    group.visible = false;
    this.pool.push({ group, freeAt: performance.now() + 60 });
  }

  isActive(): boolean {
    return this.enabled || this.forceHeadless;
  }
}

export const state = new TrafficState();

/** The player entity (spawn/despawn/reaction centre) — read via the sanctioned ECS contract. */
export const players = world.with("isPlayer", "transform");

export function playerEntity(): ClientEntity | undefined {
  return players.entities[0];
}

/** Offscreen test relative to the captured camera. No camera info → treat as offscreen (allow). */
export function offscreen(x: number, z: number): boolean {
  const v = state.view;
  if (!v.hasCamera) return true;
  let dx = x - v.camX;
  let dz = z - v.camZ;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  return dx * v.fwdX + dz * v.fwdZ < COS_HALF_FOV;
}
