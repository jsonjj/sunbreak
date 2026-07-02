// ECS augmentation for the traffic subsystem. Declaration-merged into the shared `SimComponents`
// so these flow into SimEntity/ClientEntity automatically (see the contract in
// @sunbreak/shared → ecs/components.ts). Every field is prefixed `traffic_` per the wave contract
// and is optional / a presence-tag. The `import type` keeps this file a real module so the
// `declare module` AUGMENTS (never replaces) `@sunbreak/shared`.
import type { VehicleId } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { TrafficCar } from "./types";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** The ambient-car simulation state (lane, arc-length, IDM driver, LOD, physics handle…). */
    traffic_car?: TrafficCar;
    /** Presence tag: this entity is a traffic-owned ambient vehicle. */
    traffic_ambient?: true;
    /** Presence tag: the player may carjack this ambient car (near + reachable). */
    traffic_carjackable?: true;
    /** Presence tag: this entity was handed off to vehicle-gameplay via `promoteToDrivable`. */
    traffic_promoted?: true;
    /** The model to drive once promoted (mirrors the ambient car's VehicleId for continuity). */
    traffic_vehicleId?: VehicleId;
  }
}

/** Every ambient car (sim runs headless off this). */
export const trafficQuery = world.with("traffic_car");
/** Cars that also carry a live THREE object — what the R3F bridge renders. */
export const trafficRenderQuery = world.with("traffic_car", "three");
/** Cars offered to the player as carjack targets (consumed by interaction/vehicle-gameplay). */
export const carjackableQuery = world.with("traffic_car", "traffic_carjackable", "transform");
/** Entities handed off from traffic → vehicle-gameplay (adopt these to seat the player). */
export const promotedQuery = world.with("traffic_promoted", "vehicle", "transform");

export {};
