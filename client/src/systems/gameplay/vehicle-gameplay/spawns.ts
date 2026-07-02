// Parked-car spawn points for v1 (near the default player spawn ~[0,2,6]). Data-only so the
// integrator / world subsystem can later replace this with data/vehicle-spawns.json or
// street-graph-derived parking without touching the spawner.

import { VehicleId } from "@sunbreak/shared";

export interface ParkedSpawn {
  spec: VehicleId;
  x: number;
  z: number;
  yaw: number; // radians, about +Y
}

export const PARKED_SPAWNS: ParkedSpawn[] = [
  { spec: VehicleId.Sedan, x: 5, z: 3, yaw: 0 },
  { spec: VehicleId.Coupe, x: -5, z: 5, yaw: Math.PI / 2 },
  { spec: VehicleId.Suv, x: 9, z: 10, yaw: -Math.PI / 4 },
];
