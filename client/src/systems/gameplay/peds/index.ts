// PEDESTRIAN AI — SUNBREAK (client · gameplay/peds)
// Ambient crowd of Santa Vista: ring-spawned around the player, sidewalk-wandering over the city
// road-graph (with a lattice fallback), fleeing gunfire via the shared damage/threat ingress,
// density-LOD'd, kinematic (non-Rapier), rendered as InstancedMesh through the ECS↔R3F bridge.
// Peds carry `stat_health` so combat can kill them → ragdoll handoff.
//
// Self-registers via registerModule (no central edits). Implements gta6-build/03-gameplay/
// pedestrian-ai.md within the Wave-2 protocol (docs/WAVE2-PROTOCOL.md).

import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { useGameStore } from "@/stores/game.store";

import "./components"; // ped_* ECS augmentations
import "./contracts"; // stat_health shared-contract augmentation

import { warmPool, clearPool } from "./pool";
import { buildRenderRoot, disposeRenderRoot, writeInstances } from "./render/pedInstances";
import { rebuildPedHash } from "./spatialHash";
import { tickSpawn } from "./spawn";
import { tickPerception, installThreatBridges, uninstallThreatBridges } from "./perception";
import { tickBehavior } from "./behavior";
import { tickMovement } from "./movement";
import { pedMovable, pedShouldTick, tickLod } from "./lod";
import { setPedRoadGraph } from "./nav";
import { installPedGlobal } from "./api";
import type { RoadGraphInput } from "./types";

type W = typeof world;

const MAX_DT = 0.05; // clamp frame dt so a tab-stall can't teleport the crowd
const playing = (): boolean => useGameStore.getState().phase === "playing";

// The single entity that hosts the InstancedMesh group as a `three` view component. A generic
// ECS↔R3F bridge (render subsystem/integrator) that renders `entity.three` will mount it with no
// hand-mounting into App/Scene. (Alternatively mount <PedInstances/> — see wiring notes.)
let renderEntity: ClientEntity | null = null;
let cleanupGlobal: (() => void) | null = null;

/** Adopt an injected city road-graph (window global or event) → sidewalk graph. */
function tryAdoptRoadGraph(graph?: RoadGraphInput | null): void {
  const g =
    graph ??
    (typeof window !== "undefined"
      ? (window as unknown as { __SUNBREAK_ROAD_GRAPH__?: RoadGraphInput }).__SUNBREAK_ROAD_GRAPH__
      : undefined);
  if (g) setPedRoadGraph(g);
}

let onRoadGraphReady: ((ev: Event) => void) | null = null;

export const mod: SubsystemModule<W> = {
  id: "gameplay/peds",

  init() {
    const root = buildRenderRoot();
    renderEntity = { ped_renderRoot: true, three: root };
    world.add(renderEntity);

    warmPool();
    installThreatBridges();
    cleanupGlobal = installPedGlobal();

    // Consume the city road-graph "via shared data": adopt one if already published, and listen
    // for City-Gen to announce it later (map loads async). Falls back to the lattice grid meanwhile.
    tryAdoptRoadGraph();
    if (typeof window !== "undefined") {
      onRoadGraphReady = (ev: Event) =>
        tryAdoptRoadGraph((ev as CustomEvent).detail as RoadGraphInput);
      window.addEventListener("sunbreak:roadgraph-ready", onRoadGraphReady);
    }

    return () => {
      uninstallThreatBridges();
      cleanupGlobal?.();
      cleanupGlobal = null;
      if (typeof window !== "undefined" && onRoadGraphReady) {
        window.removeEventListener("sunbreak:roadgraph-ready", onRoadGraphReady);
        onRoadGraphReady = null;
      }
      if (renderEntity) {
        world.remove(renderEntity);
        renderEntity = null;
      }
      disposeRenderRoot();
      clearPool();
    };
  },

  systems: [
    {
      name: "peds:hash",
      phase: "update",
      order: 5,
      fn: () => {
        if (playing()) rebuildPedHash();
      },
    },
    {
      name: "peds:spawn",
      phase: "update",
      order: 10,
      fn: (_w, dt) => tickSpawn(dt > MAX_DT ? MAX_DT : dt), // self-guards on game phase
    },
    {
      name: "peds:perception",
      phase: "update",
      order: 20,
      fn: (_w, dt) => {
        if (playing()) tickPerception(dt > MAX_DT ? MAX_DT : dt);
      },
    },
    {
      name: "peds:behavior",
      phase: "update",
      order: 30,
      fn: (_w, dt) => {
        if (playing()) tickBehavior(dt > MAX_DT ? MAX_DT : dt, pedShouldTick);
      },
    },
    {
      name: "peds:movement",
      phase: "update",
      order: 40,
      fn: (_w, dt) => {
        if (playing()) tickMovement(dt > MAX_DT ? MAX_DT : dt, pedMovable);
      },
    },
    {
      name: "peds:lod",
      phase: "update",
      order: 50,
      fn: (_w, dt) => {
        if (playing()) tickLod(dt > MAX_DT ? MAX_DT : dt);
      },
    },
    {
      name: "peds:render",
      phase: "render",
      order: 10,
      fn: () => writeInstances(),
    },
  ],
};

registerModule(mod);

// ── Re-exports for the integrator / sibling subsystems ──────────────────────────────────────
export { pedsApi } from "./api";
export { PedInstances } from "./render/pedInstancesView";
export { PedColliders } from "./render/pedCollidersView";
export {
  applyThreat,
  raiseThreat,
  reportDamageEvent,
  pedThreatBus,
} from "./perception";
export { killPed } from "./behavior";
export { getPedsNear, nearestPed } from "./spatialHash";
export { setPedRoadGraph, setPedNavProvider } from "./nav";
export { setPedVehicleProvider } from "./movement";
export type { ThreatEvent, RoadGraphInput, PedAgent, NavProvider } from "./types";
