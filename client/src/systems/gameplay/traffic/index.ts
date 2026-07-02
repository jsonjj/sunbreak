// Subsystem: gameplay/traffic (client) — lane-graph IDM ambient cars derived from the City-Gen road
// graph, spawned in a bubble around the player, driven kinematically (physics only when near), that
// react to the player + police and hand off to vehicle-gameplay on carjack.
//
// SELF-REGISTRATION: importing this file (the systems-loader does so automatically) registers the
// sim (update + render systems). The sim is INERT until the integrator mounts <TrafficView/> inside
// <Physics> — that's the ECS↔R3F render + near-physics seam (see "Integrator wiring" below), so this
// subsystem can never disturb the v0 scene on its own.
//
// Integrator wiring (one line, inside <Physics> in client/src/game/Scene.tsx):
//     import { TrafficView } from "@/systems/gameplay/traffic";
//     <PhysicsProvider> … <TrafficView /> … </PhysicsProvider>
// Then wire the loose providers wherever those subsystems live, e.g.:
//     provideRoadNetwork(cityStore.getRoadGraph());          // render/city
//     provideWanted(() => useWantedStore.getState().stars);  // gameplay/wanted
//     provideVehicleSpawner((spec) => spawnVehicle(spec));   // gameplay/vehicle-gameplay (optional)
import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import "./traffic.components"; // ensure the SimComponents augmentation + queries are loaded
import { trafficRenderSystem, trafficUpdateSystem } from "./sim";

type W = typeof world;

export const traffic: SubsystemModule<W> = {
  id: "gameplay/traffic",
  systems: [trafficUpdateSystem, trafficRenderSystem],
};

registerModule(traffic);

// Public surface for other subsystems + the integrator.
export * from "./api";
export { TrafficView } from "./TrafficView";
export { TrafficDebug } from "./TrafficDebug";
export {
  trafficQuery,
  trafficRenderQuery,
  carjackableQuery,
  promotedQuery,
} from "./traffic.components";
