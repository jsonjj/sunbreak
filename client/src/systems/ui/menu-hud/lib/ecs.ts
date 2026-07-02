import { world } from "@/ecs/world";
import { queries } from "@/ecs/queries";
// Side-effect import keeps the `hud_*` ECS augmentation in the program.
import "../hud.components";

/** Local player (position + heading for the radar). Reuses the shared v0 archetype. */
export const playerQuery = queries.players;

/** Entities tagged for the HUD radar via `hud_blip` (see hud.components.ts). */
export const hudBlipQuery = world.with("hud_blip", "transform");
