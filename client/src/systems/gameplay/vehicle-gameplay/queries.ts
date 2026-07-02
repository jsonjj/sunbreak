// Reused miniplex archetype queries (create once, iterate every frame). Importing `world` is
// read-only use of the shared ECS — we never mutate the ecs/** files themselves.
import { world } from "@/ecs/world";

export const vgQueries = {
  /** The local player (occupancy lives on this entity as `vg_occupant`). */
  localPlayer: world.with("isPlayer", "transform", "isLocal"),
  /** Every gameplay-managed vehicle. */
  vehicles: world.with("vg_vehicle", "transform"),
} as const;

/** First local player entity, or undefined before <PlayerController> has spawned it. */
export const getPlayer = () => vgQueries.localPlayer.entities[0];

/** Find a gameplay vehicle by its netId. */
export const getVehicle = (netId: number) => {
  for (const e of vgQueries.vehicles.entities) if (e.netId === netId) return e;
  return undefined;
};
