// Bus → runtime signal buffer. Event-driven objective completion (interact / vehicleEntered /
// itemCollected / playerDied) is collected here so objective handlers can poll cheaply without
// each subscribing to mitt. Per-objective semantics ("since this objective started") are
// achieved by the runtime calling `resetPerObjective()` on objective entry.

import { world } from "@/ecs/world";
import { missionEvents } from "./events";

export const signals = {
  interacts: new Set<string>(),
  vehiclesEntered: new Set<string>(),
  itemsCollected: new Set<string>(),
  kills: [] as { netId?: number; spawnRef?: string }[],
  playerDied: false,

  /** Cleared when a new objective becomes active (interact/collect/enterVehicle are per-objective). */
  resetPerObjective(): void {
    this.interacts.clear();
    this.vehiclesEntered.clear();
    this.itemsCollected.clear();
    this.kills.length = 0;
  },

  /** Cleared when a mission ends/starts. */
  resetAll(): void {
    this.resetPerObjective();
    this.playerDied = false;
  },
};

const onInteract = (e: { targetId: string }) => signals.interacts.add(e.targetId);
const onVehicleEntered = (e: { vehicleRef?: string }) => {
  if (e.vehicleRef) signals.vehiclesEntered.add(e.vehicleRef);
};
const onItemCollected = (e: { itemRef: string }) => signals.itemsCollected.add(e.itemRef);
const onEntityKilled = (e: { netId?: number; spawnRef?: string }) =>
  signals.kills.push({ netId: e.netId, spawnRef: e.spawnRef });
const onPlayerDied = () => {
  signals.playerDied = true;
};

// Bridge the ECS removal event → an `entityKilled` bus event for mission enemies. This means
// external combat that removes a dead entity automatically notifies any bus listeners, and our
// own eliminate handler (which re-counts survivors) stays robust either way.
let unsubRemoved: (() => void) | null = null;

export function attachSignals(): () => void {
  missionEvents.on("interact", onInteract);
  missionEvents.on("vehicleEntered", onVehicleEntered);
  missionEvents.on("itemCollected", onItemCollected);
  missionEvents.on("entityKilled", onEntityKilled);
  missionEvents.on("playerDied", onPlayerDied);

  unsubRemoved = world.onEntityRemoved.subscribe((e) => {
    if (e.mission_enemy) {
      missionEvents.emit("entityKilled", {
        netId: e.netId,
        missionRef: e.mission_ref,
        spawnRef: e.mission_spawnRef,
      });
    }
  });

  return () => {
    missionEvents.off("interact", onInteract);
    missionEvents.off("vehicleEntered", onVehicleEntered);
    missionEvents.off("itemCollected", onItemCollected);
    missionEvents.off("entityKilled", onEntityKilled);
    missionEvents.off("playerDied", onPlayerDied);
    unsubRemoved?.();
    unsubRemoved = null;
    signals.resetAll();
  };
}
