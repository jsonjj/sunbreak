// ECS↔R3F bridge root for vehicle physics. Reactively mounts one <VehicleBody> per entity that
// carries the `veh_isVehicle` tag, so vehicles are rendered/simulated purely from ECS state —
// no hand-mounting of individual cars into the scene graph.
//
// INTEGRATOR: mount this once inside the Rapier <Physics> tree (e.g. in client/src/game/Scene.tsx
// beside <PlayerController/>). It relies on useRapier()/useBeforePhysicsStep, so it MUST live
// under <PhysicsProvider>. Vehicle physics self-registers its systems from index.ts; only this
// view needs a mount point.
import { ECS, world } from "@/ecs/world";
import { VehicleBody } from "./VehicleBody";

/** Reused archetype query: every physics-simulated vehicle. */
const vehicleQuery = world.with("veh_isVehicle");

export function VehiclePhysicsView() {
  return <ECS.Entities in={vehicleQuery}>{(entity) => <VehicleBody entity={entity} />}</ECS.Entities>;
}
