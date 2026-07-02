// The typed mission event bus (mitt, ~200 B). This is the decoupling seam: combat, vehicles,
// interaction and player subsystems EMIT into it; the mission runtime SUBSCRIBES. Nobody has to
// import anybody else's internals — they only agree on `GameEvents`.
//
// Producers (once those subsystems land) should:
//   import { missionEvents } from "@/systems/gameplay/missions";
//   missionEvents.emit("entityKilled", { netId });
//
// Until then the mission runtime also derives most signals itself (proximity, ECS sweeps) so
// missions are fully playable today.

import mitt, { type Emitter } from "mitt";

export type GameEvents = {
  /** Player entered/exited an area sensor (start triggers, goto zones). */
  areaEntered: { areaId: string };
  areaExited: { areaId: string };
  /** Player pressed the interact key on a focused target (from the interaction subsystem). */
  interact: { targetId: string };
  /** Player got into / out of a vehicle (from the vehicle-gameplay subsystem). */
  vehicleEntered: { vehicleRef?: string; netId?: number };
  vehicleExited: { vehicleRef?: string; netId?: number };
  /** An entity died (from combat / `world.onEntityRemoved`). */
  entityKilled: { netId?: number; missionRef?: string; spawnRef?: string };
  /** A world item was picked up (from inventory / interaction). */
  itemCollected: { itemRef: string };
  playerDied: Record<string, never>;

  // Emitted BY the mission system for other subsystems (HUD, audio, save, minimap).
  missionStarted: { missionId: string };
  missionCompleted: { missionId: string; medal: string | null };
  missionFailed: { missionId: string; reason: string };
};

export const missionEvents: Emitter<GameEvents> = mitt<GameEvents>();
