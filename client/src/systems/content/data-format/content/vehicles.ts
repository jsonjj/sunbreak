// content/data-format — seed vehicle catalog.
//
// Two real vehicles so consumers (physics/vehicle) have data day one: a muscle car for Mac
// Doyle and a sports car for Cami Reyes. Typed with `satisfies VehicleInput[]` for compile-time
// checking; the actual zod validation + registration happens in `registerSeedContent()` (guarded).
import type { VehicleInput } from "../schemas";

export const SEED_VEHICLES = [
  {
    id: "veh_doyle-muscle",
    name: "Verano V8 Brawler",
    class: "muscle",
    handling: {
      mass: 1700,
      enginePower: 520,
      topSpeed: 205,
      brakeForce: 24,
      steerAngleDeg: 34,
      driveType: "rwd",
      frictionSlip: 2.6,
      suspension: { stiffness: 28, damping: 4.2, travel: 0.28, restLength: 0.4 },
    },
    seats: 2,
    health: 1200,
    model: "vehicles/doyle_muscle.glb",
    color: "#8c2f2f",
    price: 0,
    spawnWeight: 3,
    spawnDistricts: ["district_costa-dorada"],
    flags: ["lead-owned"],
  },
  {
    id: "veh_reyes-sport",
    name: "Costa Aterrizar GT",
    class: "sports",
    handling: {
      mass: 1300,
      enginePower: 620,
      topSpeed: 262,
      brakeForce: 26,
      steerAngleDeg: 38,
      driveType: "awd",
      frictionSlip: 2.9,
      suspension: { stiffness: 34, damping: 4.5, travel: 0.18, restLength: 0.3 },
    },
    seats: 2,
    health: 1000,
    model: "vehicles/reyes_sport.glb",
    color: "#1f6f8c",
    price: 0,
    spawnWeight: 2,
    flags: ["lead-owned"],
  },
] satisfies VehicleInput[];
