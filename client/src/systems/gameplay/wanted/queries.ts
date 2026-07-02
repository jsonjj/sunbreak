// Reused, module-level miniplex queries (create once, iterate every frame). Importing the
// world is read-only use of the central ECS — we never edit `client/src/ecs`.
import { world } from "@/ecs/world";

/** The local suspect (player). Heat only ever accrues to this entity in v2. */
export const playerQuery = world.with("isPlayer", "transform");

/** Every police unit (deployed or idle in the pool). */
export const policeQuery = world.with("wanted_police", "transform");

/** Only deployed police (rendered + ticked by the FSM). */
export const activePoliceQuery = world.with("wanted_police", "wanted_active", "transform");

/** Anything currently dead — scanned by the crime probe to attribute kills to the player. */
export const deadQuery = world.with("isDead", "transform");

/** Ambient witnesses (peds). Empty until the Peds subsystem lands; the hook is ready. */
export const witnessQuery = world.with("isPed", "transform").without("wanted_police");
