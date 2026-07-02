// Registered (non-physics-step) systems for physics/vehicle. The heavy per-step work lives in
// the R3F component (`useVehicleController`, anchored to Rapier's step hooks). This system only
// normalizes spawn requests so a vehicle can be created purely through ECS data: any consumer
// may `world.add({ veh_spawnRequest, transform? })` and this turns it into a full vehicle.
import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import { normalizeVehicleEntity } from "./runtime";

type W = typeof world;

/** Entities that requested a vehicle but haven't been turned into one yet. */
const spawnIntakeQuery = world.with("veh_spawnRequest").without("veh_isVehicle");

/**
 * Update-phase intake: promote `veh_spawnRequest`-only entities into full vehicles (adds the
 * component set + `veh_isVehicle` tag, which mounts the body via the render bridge).
 */
export const vehicleSpawnIntakeSystem: System<W> = {
  name: "veh_spawnIntake",
  phase: "update",
  order: -100,
  fn: () => {
    const ents = spawnIntakeQuery.entities;
    // Iterate back-to-front: normalize adds `veh_isVehicle`, which reindexes the entity OUT of
    // this query, so a forward loop would skip the next entry.
    for (let i = ents.length - 1; i >= 0; i--) {
      normalizeVehicleEntity(ents[i]!);
    }
  },
};
