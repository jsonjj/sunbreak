// Internal runtime types shared by the FSM, the kind controllers and the manager. Kept separate
// from the authoring types (../types.ts) to avoid import cycles (kinds import this; the FSM
// imports kinds).

import type { Vec3 } from "@sunbreak/shared";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { ActivityDef, RunResult, RunState } from "../types";
import type { BlipsPort } from "../ports";

/** Live state for the single in-flight run (spec: one active run at a time). */
export interface ActiveRun {
  runId: string;
  def: ActivityDef;
  state: RunState;
  /** performance.now() when the run left `dormant`. */
  startedAtMs: number;
  /** Remaining "Go!" countdown (ms). */
  countdownMs: number;
  /** Elapsed active time (ms). */
  elapsedMs: number;
  /** Remaining time limit (ms) or null when untimed. */
  timeLimitMs: number | null;
  /** Remaining cooldown after finishing (ms). */
  cooldownMs: number;
  score: number;
  progress: number;
  total: number;
  /** Current objective index (checkpoint / delivery leg). */
  index: number;
  /** Laps completed (race circuits). */
  lap: number;
  /** Human-readable current objective line for the HUD. */
  objectiveText: string;
  /** ECS entities spawned for this run (despawned on cleanup). */
  nodes: ClientEntity[];
  /** Per-kind scratch space. */
  scratch: Record<string, unknown>;
  result: RunResult | null;
}

/** What a kind controller reports each tick. */
export interface ObjectiveTick {
  progress: number;
  total: number;
  score: number;
  text: string;
  done: boolean;
  failed: boolean;
  /** Current objective position for the waypoint blip (null = none). */
  waypoint?: Vec3 | null;
}

export interface RunContext {
  run: ActiveRun;
  /** Local player world position, or null if the player entity is not present. */
  playerPos: () => Vec3 | null;
  blips: BlipsPort;
}

/** Per-ActivityKind logic: spawns objective entities, evaluates progress, cleans up. */
export interface KindController {
  kind: ActivityDef["kind"];
  /** Spawn objective entities + arm the first objective. Called once on run start. */
  start(ctx: RunContext): void;
  /** Advance objective evaluation. Called every active frame. */
  tick(ctx: RunContext, dt: number): ObjectiveTick;
  /** Despawn entities + clear waypoint blips. Called on success/fail/cancel. */
  cleanup(ctx: RunContext): void;
}
