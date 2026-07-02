// The v1 world vehicle roster: what spawns where when the player loads in. Data-only so the
// integrator / world subsystem can later replace this with data/vehicle-spawns.json or
// street-graph-derived parking without touching the spawner.
//
// Ground cars + the motorcycle sit on the beachfront near the player spawn (~[0,2,6]); the
// aircraft + boats sit on their acquisition landmarks (helipad / airstrip / marina) — whose world
// coordinates come from the physics subsystem's LANDMARKS so visuals and spawns never desync.

import { VehicleId } from "@sunbreak/shared";
import { ExtVehicleId, LANDMARKS } from "@/systems/physics/vehicle";
import { WATER_LEVEL } from "@/systems/render/city/geography";
import type { VehicleSpecId } from "./types";

export interface VehicleSpawnDef {
  spec: VehicleSpecId;
  x: number;
  z: number;
  /** Explicit rest height (aircraft/boats). Cars omit it and settle onto the ground. */
  y?: number;
  /** Spawn yaw (radians, about +Y). */
  yaw?: number;
}

const { helipad, runway, marina } = LANDMARKS;

export const VEHICLE_SPAWNS: VehicleSpawnDef[] = [
  // ── Ground cars — beachfront streets/curb near the player spawn ──
  { spec: VehicleId.Sedan, x: 5, z: 3, yaw: 0 },
  { spec: VehicleId.Coupe, x: -5, z: 5, yaw: Math.PI / 2 },
  { spec: VehicleId.Suv, x: 9, z: 11, yaw: -Math.PI / 4 },
  { spec: VehicleId.Sports, x: 16, z: -3, yaw: 0 },
  { spec: VehicleId.Truck, x: -15, z: 9, yaw: Math.PI / 6 },
  { spec: VehicleId.Police, x: 21, z: 5, yaw: 0 },
  // ── Motorcycle — right by the spawn ──
  { spec: ExtVehicleId.Motorcycle, x: 12, z: 6, yaw: 0 },
  // ── Helicopter — on the beachfront helipad ──
  { spec: ExtVehicleId.Helicopter, x: helipad.x, z: helipad.z, y: helipad.topY + 1.6, yaw: 0 },
  // ── Plane — at the west threshold of the airstrip, pointing down the runway (+X) ──
  {
    spec: ExtVehicleId.Plane,
    x: runway.x - runway.halfLength + 8,
    z: runway.z,
    y: runway.topY + 1.4,
    yaw: runway.headingY,
  },
  // ── Boats — moored in the marina basin (settle to the waterline; face the open bay, +Z/south) ──
  { spec: ExtVehicleId.Boat, x: marina.x, z: marina.z + marina.halfZ + 4, y: WATER_LEVEL + 0.6, yaw: 0 },
  { spec: ExtVehicleId.Boat, x: marina.x + 6, z: marina.z + 8, y: WATER_LEVEL + 0.6, yaw: 0 },
];
