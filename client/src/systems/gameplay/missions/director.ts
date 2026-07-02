// The director executes a stage's `Action[]`: it scripts the world by adding mission-owned ECS
// entities (enemies / vehicles / props, all tagged `mission_ref` + `mission_spawnRef`) and
// applying side effects (wanted, weapons, dialogue, markers). Sibling subsystems (combat, AI,
// vehicles, render) consume those entities via their normal `world.with(...)` queries.
//
// Every spawned entity carries `mission_ref` so `cleanup(ref)` can deterministically sweep the
// world when the mission ends — no entity leaks across replays.

import { VehicleId } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { useUiStore } from "@/stores/ui.store";
import type { Action } from "./schema";
import type { MissionCtx } from "./types";
import { useMissionStore } from "./store";
import { runCustomAction } from "./registries";
import { identityQuat, jitter, tupleToVec3 } from "./util";

// Mission entities live in a high netId range to avoid colliding with the player (netId 1) and
// other subsystems' low-range allocations.
let netCounter = 1_000_000;
const nextNetId = () => ++netCounter;

const missionRefQuery = world.with("mission_ref");

/** Extra markers requested imperatively via `setObjectiveMarker`, keyed by mission run ref. */
export const directorMarkers = new Map<
  string,
  { id: string; position: [number, number, number]; label?: string; color?: string; waypoint?: boolean }[]
>();

function vehicleIdFrom(model: string): VehicleId {
  return ((Object.values(VehicleId) as string[]).includes(model) ? model : VehicleId.Sedan) as VehicleId;
}

function applyAction(a: Action, ctx: MissionCtx, missionRef: string, stageIndex: number): void {
  switch (a.kind) {
    case "spawnEnemies": {
      for (let i = 0; i < a.count; i++) {
        const pos = jitter(a.position, a.radius ?? 0);
        const hp = a.health ?? 100;
        const enemy: ClientEntity = {
          mission_ref: missionRef,
          mission_spawnRef: a.ref,
          mission_role: "enemy",
          mission_enemy: true,
          mission_behavior: a.behavior ?? "attack",
          mission_weapon: a.weapon,
          mission_spawnedAtStage: stageIndex,
          isPed: true,
          isActive: true,
          netId: nextNetId(),
          transform: { position: tupleToVec3(pos), rotation: identityQuat() },
          health: { current: hp, max: hp, armor: 0 },
          ai: { behavior: "combat" },
        };
        world.add(enemy);
      }
      break;
    }
    case "spawnVehicle": {
      const vehicle: ClientEntity = {
        mission_ref: missionRef,
        mission_spawnRef: a.ref,
        mission_role: "vehicle",
        mission_vehicleModel: a.model,
        mission_heading: a.heading,
        mission_spawnedAtStage: stageIndex,
        isVehicle: true,
        isActive: true,
        netId: nextNetId(),
        transform: { position: tupleToVec3(a.position), rotation: identityQuat() },
        vehicle: { id: vehicleIdFrom(a.model), seats: 4, occupants: [], engineOn: false, speedKmh: 0 },
      };
      world.add(vehicle);
      break;
    }
    case "spawnProp": {
      const prop: ClientEntity = {
        mission_ref: missionRef,
        mission_spawnRef: a.ref,
        mission_role: "prop",
        mission_propModel: a.model,
        mission_collectRef: a.ref,
        mission_spawnedAtStage: stageIndex,
        isProp: true,
        isActive: true,
        netId: nextNetId(),
        transform: { position: tupleToVec3(a.position), rotation: identityQuat() },
      };
      world.add(prop);
      break;
    }
    case "despawn":
      director.despawnRef(missionRef, a.ref);
      break;
    case "setWanted":
      ctx.wanted.set(a.stars);
      break;
    case "giveWeapon":
      ctx.economy.giveWeapon(a.weaponId);
      break;
    case "setObjectiveMarker": {
      const list = directorMarkers.get(missionRef) ?? [];
      list.push({ id: `dir:${list.length}`, position: a.position, label: a.label, color: a.color, waypoint: a.waypoint });
      directorMarkers.set(missionRef, list);
      break;
    }
    case "dialogue": {
      const line = a.line ?? "";
      useMissionStore.getState().setDialogue({ speaker: a.speaker, line });
      useUiStore.getState().pushToast({
        id: `mission-dlg-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
        text: line ? `${a.speaker}: ${line}` : a.speaker,
      });
      // a.aiPrompt is intentionally ignored client-side (v3 routes it via the server OpenAI proxy).
      break;
    }
    case "playSound":
      // Audio subsystem hook (stub today): missions stay silent-but-correct until audio lands.
      break;
    case "cutscene":
      // Cinematics handoff (v3).
      break;
    case "custom":
      runCustomAction(a.id, a.args, ctx);
      break;
  }
}

export const director = {
  run(actions: readonly Action[], ctx: MissionCtx, missionRef: string, stageIndex: number): void {
    for (const a of actions) applyAction(a, ctx, missionRef, stageIndex);
  },

  /** Remove every entity belonging to a mission run + its imperative markers. */
  cleanup(missionRef: string): void {
    for (const e of [...missionRefQuery.entities]) {
      if (e.mission_ref === missionRef) world.remove(e);
    }
    directorMarkers.delete(missionRef);
  },

  /** Remove one spawn group (`despawn` action). */
  despawnRef(missionRef: string, ref: string): void {
    for (const e of [...missionRefQuery.entities]) {
      if (e.mission_ref === missionRef && e.mission_spawnRef === ref) world.remove(e);
    }
  },

  /** Record which spawn refs currently exist for this run (used by protect/vehicleDestroyed
   *  fail states to distinguish "never spawned" from "destroyed"). */
  liveSpawnRefs(missionRef: string): Set<string> {
    const refs = new Set<string>();
    for (const e of missionRefQuery.entities) {
      if (e.mission_ref === missionRef && e.mission_spawnRef) refs.add(e.mission_spawnRef);
    }
    return refs;
  },
};
