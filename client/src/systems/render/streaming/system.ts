// ECS systems for streaming. All work is driven from the anchor (player) transform in the ECS —
// no camera required — so streaming runs from plain registry phases:
//   • update: advance the ChunkManager (resident diff + look-ahead) and time-slice its pump, then
//     ACTIVATE/DEACTIVATE every `stream_chunk`-tagged entity by chunk residency + distance.
//   • finish: mirror streaming stats into a Zustand store for the HUD / perf overlay.
import type { System } from "@sunbreak/shared";
import { create } from "zustand";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { getEngine } from "./engine";
import { CELL } from "./grid";
import type { StreamStats } from "./chunkManager";

type W = typeof world;

// Live queries (created once, iterated every frame).
const anchorQ = world.with("stream_anchor", "transform");
const playerQ = world.with("isPlayer", "transform");
const localQ = world.with("isLocal", "transform");
const streamables = world.with("stream_chunk", "transform");

/** Streaming follows an explicit `stream_anchor`, else the local player, else any local entity. */
function anchorEntity(): ClientEntity | undefined {
  return anchorQ.entities[0] ?? playerQ.entities[0] ?? localQ.entities[0];
}

const NEAR2 = CELL * CELL;
const MID2 = (2 * CELL) * (2 * CELL);
const MAX_SPEED = 60; // m/s clamp so a teleport/respawn can't spike the look-ahead

let lastX = 0;
let lastZ = 0;
let hasLast = false;

/** Toggle streamed entities' active state + visibility by residency and set a coarse LOD band. */
function activateByDistance(px: number, pz: number): void {
  const mgr = getEngine().manager;
  for (const e of streamables) {
    const key = e.stream_chunk!;
    const t = e.transform!;
    const resident = mgr.isResident(key);
    if (resident) {
      if (!e.stream_active) world.addComponent(e, "stream_active", true);
      if (!e.isActive) world.addComponent(e, "isActive", true);
      if (e.three) e.three.visible = true;
      const dx = t.position.x - px;
      const dz = t.position.z - pz;
      const d2 = dx * dx + dz * dz;
      e.stream_lod = d2 < NEAR2 ? 0 : d2 < MID2 ? 1 : 2;
    } else {
      if (e.stream_active) world.removeComponent(e, "stream_active");
      if (e.isActive) world.removeComponent(e, "isActive");
      if (e.three) e.three.visible = false;
    }
  }
}

const updateSystem: System<W> = {
  name: "streaming/update",
  phase: "update",
  order: 100, // run late so newly-spawned streamable entities are considered this frame
  fn: (_w, dt) => {
    const anchor = anchorEntity();
    if (!anchor?.transform) return;
    const p = anchor.transform.position;

    let vx = 0;
    let vz = 0;
    if (hasLast && dt > 1e-4) {
      vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, (p.x - lastX) / dt));
      vz = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, (p.z - lastZ) / dt));
    }
    lastX = p.x;
    lastZ = p.z;
    hasLast = true;

    const engine = getEngine();
    engine.manager.update(p.x, p.z, vx, vz);
    engine.manager.pump();
    activateByDistance(p.x, p.z);
  },
};

interface StreamStatsStore {
  stats: StreamStats | null;
  set: (s: StreamStats) => void;
}

/** Live streaming stats for a HUD / perf overlay (updated ~4×/s in the finish phase). */
export const useStreamStats = create<StreamStatsStore>((set) => ({
  stats: null,
  set: (stats) => set({ stats }),
}));

let frame = 0;
const statsSystem: System<W> = {
  name: "streaming/stats",
  phase: "finish",
  order: 100,
  fn: () => {
    if (++frame % 15 !== 0) return;
    useStreamStats.getState().set(getEngine().manager.stats);
  },
};

export function buildStreamingSystems(): System<W>[] {
  return [updateSystem, statsSystem];
}
