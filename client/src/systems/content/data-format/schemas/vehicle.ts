// content/data-format — vehicle catalog schema.
//
// `Vehicle.handling` maps to Rapier raycast-vehicle controller params consumed by the
// physics/vehicle subsystem. Only `id`, `name`, and `class` are required; the whole handling
// block defaults to a sane sedan-ish setup so a minimal catalog entry validates.
import { z } from "zod";
import { AssetRef, Vec3, withEnvelope } from "./primitives";

export const VehicleClass = z.enum([
  "super",
  "sports",
  "muscle",
  "sedan",
  "suv",
  "motorcycle",
  "truck",
  "van",
  "compact",
  "offroad",
  "boat",
  "emergency",
]);
export type VehicleClass = z.infer<typeof VehicleClass>;

export const DriveType = z.enum(["fwd", "rwd", "awd"]);
export type DriveType = z.infer<typeof DriveType>;

/** Per-wheel suspension tuning (Rapier raycast-vehicle). */
export const Suspension = z
  .object({
    stiffness: z.number().positive().default(30),
    damping: z.number().nonnegative().default(4),
    travel: z.number().nonnegative().default(0.25),
    restLength: z.number().nonnegative().default(0.35),
  })
  .passthrough();
export type Suspension = z.infer<typeof Suspension>;

export const Handling = z
  .object({
    mass: z.number().positive().default(1400),
    enginePower: z.number().default(400),
    /** Top speed target (km/h). */
    topSpeed: z.number().positive().default(180),
    /** Optional gear ratios, high→low; omit for an auto single-ratio model. */
    gearing: z.array(z.number()).optional(),
    brakeForce: z.number().nonnegative().default(20),
    steerAngleDeg: z.number().positive().default(35),
    suspension: Suspension.default({}),
    frictionSlip: z.number().positive().default(2.5),
    /** Center-of-mass offset from the body origin. */
    comOffset: Vec3.default([0, 0, 0]),
    driveType: DriveType.default("rwd"),
  })
  .passthrough();
export type Handling = z.infer<typeof Handling>;

/** A drivable vehicle definition. `schema: "sunbreak.vehicle"`. */
export const Vehicle = withEnvelope("sunbreak.vehicle", {
  name: z.string(),
  class: VehicleClass,
  handling: Handling.default({}),
  seats: z.number().int().positive().default(2),
  wheels: z.number().int().nonnegative().default(4),
  health: z.number().positive().default(1000),
  fuel: z.number().nonnegative().default(100),
  price: z.number().nonnegative().default(0),
  spawnWeight: z.number().nonnegative().default(1),
  /** Districts this vehicle prefers to spawn in (RoadNode/District ids); empty = anywhere. */
  spawnDistricts: z.array(z.string()).default([]),
  model: AssetRef.optional(),
  color: z.string().optional(),
  flags: z.array(z.string()).default([]),
});
export type Vehicle = z.infer<typeof Vehicle>;
