// content/data-format — weapon catalog schema.
//
// Consumed by the combat subsystem for damage/ballistics. Only `id`, `name`, and `category`
// are required; ballistic fields default so a stub weapon still resolves to usable numbers.
import { z } from "zod";
import { AssetRef, withEnvelope } from "./primitives";

export const WeaponCategory = z.enum([
  "melee",
  "handgun",
  "smg",
  "shotgun",
  "assault",
  "sniper",
  "heavy",
  "thrown",
]);
export type WeaponCategory = z.infer<typeof WeaponCategory>;

export const WeaponSlot = z.enum(["long", "sidearm", "melee", "throwable", "heavy"]);
export type WeaponSlot = z.infer<typeof WeaponSlot>;

export const FireMode = z.enum(["semi", "auto", "burst", "charge", "none"]);
export type FireMode = z.infer<typeof FireMode>;

/** A weapon definition. `schema: "sunbreak.weapon"`. */
export const Weapon = withEnvelope("sunbreak.weapon", {
  name: z.string(),
  category: WeaponCategory,
  slot: WeaponSlot.optional(),
  damage: z.number().nonnegative().default(10),
  /** Hit-zone multipliers applied to base damage. */
  headMult: z.number().default(2),
  limbMult: z.number().default(0.7),
  /** Linear damage falloff between `near` (full) and `far` (min) distances, metres. */
  falloff: z
    .object({ near: z.number().default(15), far: z.number().default(60) })
    .passthrough()
    .default({}),
  rpm: z.number().positive().default(300),
  fireMode: FireMode.default("semi"),
  /** Projectiles per shot (>1 for shotguns). */
  pellets: z.number().int().positive().default(1),
  /** True = travelling projectile; false = hitscan. */
  projectile: z.boolean().default(false),
  mag: z.number().int().nonnegative().default(12),
  reserve: z.number().int().nonnegative().default(120),
  ammoType: z.string().default("generic"),
  reloadTime: z.number().nonnegative().default(2),
  recoil: z
    .object({ vertical: z.number().default(1), horizontal: z.number().default(0.5) })
    .passthrough()
    .default({}),
  spread: z
    .object({ hip: z.number().default(2), ads: z.number().default(0.5) })
    .passthrough()
    .default({}),
  adsTime: z.number().nonnegative().default(0.25),
  range: z.number().positive().optional(),
  attachments: z.array(z.string()).default([]),
  vfx: z
    .object({
      muzzle: z.string().optional(),
      impact: z.string().optional(),
      tracer: z.string().optional(),
    })
    .passthrough()
    .default({}),
  sfx: z
    .object({
      fire: z.string().optional(),
      reload: z.string().optional(),
      empty: z.string().optional(),
    })
    .passthrough()
    .default({}),
  model: AssetRef.optional(),
});
export type Weapon = z.infer<typeof Weapon>;
