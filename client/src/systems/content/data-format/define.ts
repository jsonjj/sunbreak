// content/data-format — `define*` authoring helpers.
//
// Use these in hand-authored TS catalogs (e.g. `content/vehicles.ts`) to get autocomplete on
// the INPUT shape (fields with defaults are optional) plus build-time validation: each helper
// runs `Schema.parse()` and returns the fully-defaulted, typed document. Throws `ZodError` if
// the definition is invalid — surfacing authoring mistakes at module load.
import type { z } from "zod";
import { MapChunk } from "./schemas/map";
import { Mission } from "./schemas/mission";
import { Npc } from "./schemas/npc";
import { Vehicle } from "./schemas/vehicle";
import { Weapon } from "./schemas/weapon";

export const defineVehicle = (def: z.input<typeof Vehicle>): Vehicle => Vehicle.parse(def);
export const defineWeapon = (def: z.input<typeof Weapon>): Weapon => Weapon.parse(def);
export const defineNpc = (def: z.input<typeof Npc>): Npc => Npc.parse(def);
export const defineMission = (def: z.input<typeof Mission>): Mission => Mission.parse(def);
export const defineMap = (def: z.input<typeof MapChunk>): MapChunk => MapChunk.parse(def);
