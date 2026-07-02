// Runtime-only types (the authored data types live in `./schema`).

import type { Emitter } from "mitt";
import type { World } from "miniplex";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { GameEvents } from "./events";
import type { Objective, Vec3 } from "./schema";

export type MissionStatus = "locked" | "available" | "active" | "completed" | "failed";

/** Injected read/write adapters so the runtime never hard-depends on sibling subsystems. */
export interface PlayerCtx {
  exists: () => boolean;
  entity: () => ClientEntity | null;
  position: () => Vec3;
  health: () => number;
  /** Spawn ref of the vehicle the player currently occupies, or null. */
  inVehicleRef: () => string | null;
}

export interface WantedCtx {
  stars: () => number;
  set: (stars: number) => void;
}

export interface EconomyCtx {
  addCash: (amount: number) => void;
  addRep: (amount: number) => void;
  giveWeapon: (weaponId: string) => void;
}

export interface MissionCtx {
  world: World<ClientEntity>;
  player: PlayerCtx;
  wanted: WantedCtx;
  economy: EconomyCtx;
  events: Emitter<GameEvents>;
  /** Monotonic seconds (performance.now based). */
  now: () => number;
}

export type ObjectiveResult = "pending" | "complete" | "failed";

/** Per-objective mutable scratch, created fresh when a stage is entered. */
export interface ObjectiveRuntime {
  /** Seconds accumulated (wait/survive) or dwell time (interact). */
  elapsed: number;
  /** e.g. eliminate: enemies alive at stage entry; collect: total to gather. */
  baseline: number;
  /** Free-form numeric scratch (collected count, killed count, flags). */
  data: Record<string, number>;
}

export const newObjectiveRuntime = (): ObjectiveRuntime => ({ elapsed: 0, baseline: 0, data: {} });

/**
 * One handler per objective kind. `evaluate` is called every tick for the active/parallel
 * objectives and returns whether the objective is still pending, done, or blown.
 */
export interface ObjectiveHandler {
  onEnter?: (o: Objective, ctx: MissionCtx, rt: ObjectiveRuntime, missionRef: string) => void;
  evaluate: (
    o: Objective,
    ctx: MissionCtx,
    rt: ObjectiveRuntime,
    missionRef: string,
    dt: number,
  ) => ObjectiveResult;
  /** Optional world position for the marker/waypoint of this objective. */
  markerPosition?: (o: Objective, ctx: MissionCtx, missionRef: string) => Vec3 | null;
}
