// Typed run FSM: dormant → countdown → active → (succeeded | failed) → rewarding → (cooldown).
// One run at a time. The runtime owns timers (countdown, time-limit, elapsed) and terminal
// transitions; per-kind controllers own objective spawning + evaluation. Rewards + cooldown are
// handed back to the host (ActivityManager) so it can gate re-triggering.

import type { Vec3 } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { ActivityDef, RunResult } from "../types";
import type { BlipsPort } from "../ports";
import { kindControllers } from "../kinds";
import { targetBlipId } from "../kinds/rampage";
import { applyRewards, buildResult } from "./rewards";
import { useActivityStore, type ActivityRunView } from "./store";
import type { ActiveRun, RunContext } from "./types";

const DEFAULT_COUNTDOWN_MS = 3000;
const waypointId = (runId: string): string => `act_wp_${runId}`;

export interface RuntimeHost {
  playerPos(): Vec3 | null;
  blips(): BlipsPort;
  /** Called once when a run terminates (success or failure). */
  onFinished(result: RunResult, cooldownMs: number): void;
}

export class ActivityRuntime {
  private run: ActiveRun | null = null;

  constructor(private readonly host: RuntimeHost) {}

  /** A run is occupying the runtime (countdown or active). */
  get busy(): boolean {
    return this.run != null;
  }

  get activeId(): string | null {
    return this.run?.def.id ?? null;
  }

  private ctx(run: ActiveRun): RunContext {
    return { run, playerPos: this.host.playerPos, blips: this.host.blips() };
  }

  start(def: ActivityDef): boolean {
    if (this.run) return false;
    const runId = `run_${def.id}_${Math.random().toString(36).slice(2, 8)}`;
    const run: ActiveRun = {
      runId,
      def,
      state: "countdown",
      startedAtMs: performance.now(),
      countdownMs: def.countdownMs ?? DEFAULT_COUNTDOWN_MS,
      elapsedMs: 0,
      timeLimitMs: def.timeLimitMs ?? null,
      cooldownMs: def.cooldownMs ?? 0,
      score: 0,
      progress: 0,
      total: 0,
      index: 0,
      lap: 0,
      objectiveText: "Get ready…",
      nodes: [],
      scratch: {},
      result: null,
    };
    this.run = run;
    kindControllers[def.kind].start(this.ctx(run));
    this.sync();
    useActivityStore.getState().setBanner({ kind: "info", text: `${def.name} — Get ready!`, at: performance.now() });
    return true;
  }

  /**
   * Combat integration hook: credit a rampage target that was destroyed by an external system
   * (e.g. Combat) rather than by walk-through proximity. No-op unless a rampage run is active and
   * the entity is one of its live targets.
   */
  creditTarget(entity: ClientEntity): void {
    const run = this.run;
    if (!run || run.state !== "active" || run.def.kind !== "rampage") return;
    const node = entity.act_node;
    if (!node || node.role !== "target" || node.runId !== run.runId) return;
    const idx = run.nodes.indexOf(entity);
    if (idx < 0) return;
    run.score += node.value ?? 1;
    this.host.blips().remove(targetBlipId(run.runId, node.index));
    run.nodes.splice(idx, 1);
    if (world.has(entity)) world.remove(entity);
  }

  /** Abort the in-flight run (player cancel / hard reset). No reward. */
  cancel(): void {
    if (!this.run) return;
    this.teardown(this.run);
    useActivityStore
      .getState()
      .setBanner({ kind: "fail", text: `${this.run.def.name} — Cancelled`, at: performance.now() });
    this.run = null;
    useActivityStore.getState().setRun(null);
  }

  tick(dt: number): void {
    const run = this.run;
    if (!run) return;
    const dtMs = dt * 1000;

    if (run.state === "countdown") {
      run.countdownMs -= dtMs;
      if (run.countdownMs <= 0) {
        run.countdownMs = 0;
        run.state = "active";
        run.elapsedMs = 0;
        useActivityStore
          .getState()
          .setBanner({ kind: "info", text: `${run.def.name} — Go!`, at: performance.now() });
      }
      this.sync();
      return;
    }

    if (run.state === "active") {
      run.elapsedMs += dtMs;
      if (run.timeLimitMs != null) run.timeLimitMs = Math.max(0, run.timeLimitMs - dtMs);

      const tick = kindControllers[run.def.kind].tick(this.ctx(run), dt);
      run.progress = tick.progress;
      run.total = tick.total;
      run.score = tick.score;
      run.objectiveText = tick.text;

      const blips = this.host.blips();
      if (tick.waypoint) {
        blips.upsert({
          id: waypointId(run.runId),
          x: tick.waypoint.x,
          z: tick.waypoint.z,
          kind: "waypoint",
          label: run.def.name,
        });
      } else {
        blips.remove(waypointId(run.runId));
      }

      if (tick.done) this.finish(run, true);
      else if (tick.failed) this.finish(run, false);
      else this.sync();
      return;
    }
  }

  private finish(run: ActiveRun, success: boolean): void {
    run.state = success ? "succeeded" : "failed";
    this.teardown(run);

    run.state = "rewarding";
    const result = buildResult(run, success);
    run.result = result;
    applyRewards(run, result);

    const store = useActivityStore.getState();
    if (success) {
      const detail =
        run.def.kind === "rampage"
          ? `Score ${result.score}`
          : `Time ${(result.elapsedMs / 1000).toFixed(1)}s`;
      const tier = result.tier ? ` · ${result.tier}` : "";
      store.setBanner({ kind: "success", text: `${run.def.name} complete! ${detail}${tier}`, at: performance.now() });
    } else {
      store.setBanner({ kind: "fail", text: `${run.def.name} — Failed (time up)`, at: performance.now() });
    }

    this.host.onFinished(result, run.cooldownMs);
    this.run = null;
    store.setRun(null);
  }

  /** Controller cleanup + waypoint blip removal. Safe to call once per run. */
  private teardown(run: ActiveRun): void {
    kindControllers[run.def.kind].cleanup(this.ctx(run));
    this.host.blips().remove(waypointId(run.runId));
  }

  private sync(): void {
    const run = this.run;
    if (!run) return;
    const view: ActivityRunView = {
      runId: run.runId,
      activityId: run.def.id,
      name: run.def.name,
      kind: run.def.kind,
      state: run.state,
      objectiveText: run.objectiveText,
      progress: run.progress,
      total: run.total,
      score: run.score,
      countdown: run.state === "countdown" ? Math.ceil(run.countdownMs / 1000) : 0,
      timeRemaining: run.timeLimitMs == null ? null : run.timeLimitMs / 1000,
      elapsedMs: run.elapsedMs,
    };
    useActivityStore.getState().setRun(view);
  }
}
