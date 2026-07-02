// Per-mission FSM. Owns one active mission run: enters stages (running their `onEnter` scripting
// through the director), evaluates objectives + fail states each tick, handles timers, checkpoints,
// success (rewards + medal) and failure (checkpoint retry or abort), then cleans up its entities.
//
// Phases: stageActive → (success | failed) → cleaned. Only the CURRENT stage's objectives/fail
// states are evaluated, so the per-frame cost is O(active objectives), typically < 5 checks.

import type { FailState, MissionDef, Reward, Stage, Objective, Vec3 } from "./schema";
import type { MissionCtx } from "./types";
import { newObjectiveRuntime, type ObjectiveResult, type ObjectiveRuntime } from "./types";
import { director, directorMarkers } from "./director";
import { objectiveHandlers } from "./objectives";
import { evalFailStates, failReason } from "./conditions";
import { snapshot, restore, type Checkpoint } from "./checkpoints";
import { signals } from "./signals";
import { progress, bestMedal } from "./progress";
import { useUiStore } from "@/stores/ui.store";
import {
  useMissionStore,
  type HudObjective,
  type Medal,
  type MissionMarker,
  type MissionTimerView,
} from "./store";

type Phase =
  | { t: "stageActive" }
  | { t: "success"; medal: Medal | null }
  | { t: "failed"; canRetry: boolean }
  | { t: "cleaned" };

type ObjState = "pending" | "active" | "complete" | "failed";

const SUCCESS_HOLD = 3.5;
const FAIL_HOLD = 2.5;
const RETRY_HOLD = 1.8;

let runSeq = 0;

const objOptional = (o: Objective): boolean => ("optional" in o ? o.optional === true : false);
const objMedalTag = (o: Objective): string | undefined =>
  "medalTag" in o ? (o.medalTag as string | undefined) : undefined;
const medalLabel = (m: Medal): string =>
  m === "verano_gold" ? "Verano Gold" : m === "silver" ? "Silver" : "Bronze";

export class MissionRuntime {
  readonly missionRef: string;
  private phase: Phase = { t: "stageActive" };
  private stageIndex = 0;

  private gatingIdx: number[] = [];
  private guardIdx: number[] = [];
  private optionalIdx: number[] = [];
  private currentGating = 0;

  private objRt = new Map<string, ObjectiveRuntime>();
  private objState = new Map<string, ObjState>();

  private timerRemaining: number | null = null;
  private timerTotal = 0;
  private timerId: string | undefined;
  private timerOnExpire: "fail" | "advance" | "event" | null = null;

  private checkpoint: Checkpoint | null = null;
  private spawnedRefs = new Set<string>();
  private medalTags = new Set<string>();
  private startTimeS: number;
  private resolveTimer = 0;

  constructor(
    private readonly def: MissionDef,
    private readonly ctx: MissionCtx,
  ) {
    this.missionRef = `${def.id}#${++runSeq}`;
    this.startTimeS = ctx.now();
    signals.resetAll();
    this.enterStage(0);
  }

  get isCleaned(): boolean {
    return this.phase.t === "cleaned";
  }
  get missionId(): string {
    return this.def.id;
  }

  // ── Stage lifecycle ────────────────────────────────────────────────────────
  private stage(): Stage | null {
    return this.def.stages[this.stageIndex] ?? null;
  }
  private sequence(stage: Stage): boolean {
    return stage.sequence !== false;
  }

  private enterStage(index: number): void {
    this.stageIndex = index;
    const stage = this.stage();
    if (!stage) {
      this.success();
      return;
    }
    this.phase = { t: "stageActive" };

    director.run(stage.onEnter ?? [], this.ctx, this.missionRef, index);
    for (const r of director.liveSpawnRefs(this.missionRef)) this.spawnedRefs.add(r);

    this.guardIdx = [];
    this.optionalIdx = [];
    this.gatingIdx = [];
    stage.objectives.forEach((o, idx) => {
      if (o.kind === "protect") this.guardIdx.push(idx);
      else if (objOptional(o)) this.optionalIdx.push(idx);
      else this.gatingIdx.push(idx);
    });
    if (this.gatingIdx.length === 0) {
      this.gatingIdx = this.optionalIdx;
      this.optionalIdx = [];
    }
    this.currentGating = 0;

    this.objRt = new Map();
    this.objState = new Map();
    const seq = this.sequence(stage);
    stage.objectives.forEach((o, idx) => {
      const rt = newObjectiveRuntime();
      this.objRt.set(o.id, rt);
      objectiveHandlers[o.kind].onEnter?.(o, this.ctx, rt, this.missionRef);
      const isGuard = this.guardIdx.includes(idx);
      const isGating = this.gatingIdx.includes(idx);
      const isFirstGating = this.gatingIdx[0] === idx;
      this.objState.set(o.id, isGuard || !isGating ? "active" : seq ? (isFirstGating ? "active" : "pending") : "active");
    });

    if (stage.timer) {
      this.timerRemaining = stage.timer.seconds;
      this.timerTotal = stage.timer.seconds;
      this.timerId = stage.timer.id;
      this.timerOnExpire = stage.timer.onExpire;
    } else {
      this.timerRemaining = null;
      this.timerOnExpire = null;
    }

    if (stage.checkpoint) this.checkpoint = snapshot(this.ctx, index);

    signals.resetPerObjective();
    useMissionStore.getState().setStageTitle(stage.title ?? null);
  }

  private stageComplete(): void {
    const stage = this.stage();
    if (stage) {
      director.run(stage.onComplete ?? [], this.ctx, this.missionRef, this.stageIndex);
      for (const r of director.liveSpawnRefs(this.missionRef)) this.spawnedRefs.add(r);
    }
    const next = this.stageIndex + 1;
    if (next < this.def.stages.length) this.enterStage(next);
    else this.success();
  }

  // ── Per-frame tick ─────────────────────────────────────────────────────────
  tick(dt: number): void {
    switch (this.phase.t) {
      case "cleaned":
        return;
      case "success":
        this.resolveTimer -= dt;
        if (this.resolveTimer <= 0) this.finalize();
        return;
      case "failed":
        this.resolveTimer -= dt;
        if (this.resolveTimer <= 0) {
          if (this.phase.canRetry) this.doRetry();
          else this.finalize();
        }
        return;
      case "stageActive":
        break;
    }

    const stage = this.stage();
    if (!stage) {
      this.success();
      return;
    }

    // 1) Stage timer.
    if (this.timerRemaining != null) {
      this.timerRemaining -= dt;
      if (this.timerRemaining <= 0) {
        this.timerRemaining = 0;
        if (this.timerOnExpire === "fail") {
          this.fail({ kind: "timerExpired", timerId: this.timerId });
          return;
        }
        if (this.timerOnExpire === "advance") {
          this.stageComplete();
          return;
        }
        // "event": just clear the timer and continue.
        this.timerRemaining = null;
        this.timerOnExpire = null;
      }
    }

    // 2) Fail states (mission-wide + stage + protect-derived guards).
    const guardFails = this.guardFailStates(stage);
    const failed = evalFailStates(
      [...(this.def.failStates ?? []), ...(stage.failStates ?? []), ...guardFails],
      this.ctx,
      this.missionRef,
      this.spawnedRefs,
    );
    if (failed) {
      this.fail(failed);
      return;
    }

    // 3) Guards + optionals (non-gating, parallel — HUD + medal tags only).
    for (const idx of this.guardIdx) this.evalObjective(stage, idx, dt, false);
    for (const idx of this.optionalIdx) this.evalObjective(stage, idx, dt, false);

    // 4) Gating objectives (sequential or parallel).
    if (this.sequence(stage)) {
      const idx = this.gatingIdx[this.currentGating];
      if (idx == null) {
        this.stageComplete();
        return;
      }
      const o = stage.objectives[idx];
      if (o && this.objState.get(o.id) !== "complete") {
        const res = this.evalObjective(stage, idx, dt, true);
        if (res === "failed") return;
        if (res !== "complete") return;
      }
      // advance to the next incomplete gating objective
      this.currentGating++;
      signals.resetPerObjective();
      const nextIdx = this.gatingIdx[this.currentGating];
      if (nextIdx == null) {
        this.stageComplete();
        return;
      }
      const nextO = stage.objectives[nextIdx];
      if (nextO) {
        this.objState.set(nextO.id, "active");
        const nrt = this.objRt.get(nextO.id);
        if (nrt) nrt.elapsed = 0;
      }
    } else {
      let allDone = true;
      for (const idx of this.gatingIdx) {
        const o = stage.objectives[idx];
        if (!o) continue;
        if (this.objState.get(o.id) === "complete") continue;
        const res = this.evalObjective(stage, idx, dt, true);
        if (res === "failed") return;
        if (res !== "complete") allDone = false;
      }
      if (allDone) this.stageComplete();
    }
  }

  private guardFailStates(stage: Stage): FailState[] {
    const out: FailState[] = [];
    for (const idx of this.guardIdx) {
      const o = stage.objectives[idx];
      if (o && o.kind === "protect") out.push({ kind: "protectedDied", entityRef: o.entityRef });
    }
    return out;
  }

  private evalObjective(stage: Stage, idx: number, dt: number, gating: boolean): ObjectiveResult {
    const o = stage.objectives[idx];
    if (!o) return "pending";
    if (this.objState.get(o.id) === "complete") return "complete";
    const rt = this.objRt.get(o.id);
    if (!rt) return "pending";

    const res = objectiveHandlers[o.kind].evaluate(o, this.ctx, rt, this.missionRef, dt);
    if (res === "complete") {
      this.objState.set(o.id, "complete");
      const tag = objMedalTag(o);
      if (tag) this.medalTags.add(tag);
    } else if (res === "failed") {
      if (gating) this.fail({ kind: "predicate", id: o.id });
      else this.objState.set(o.id, "failed");
    }
    return res;
  }

  // ── End states ─────────────────────────────────────────────────────────────
  private success(): void {
    const medal = this.computeMedal();
    this.phase = { t: "success", medal };

    for (const r of this.def.rewards) this.applyReward(r);
    progress.markCompleted(this.def.id, medal);

    const store = useMissionStore.getState();
    const prev = store.status[this.def.id];
    store.upsertProgress(this.def.id, {
      status: "completed",
      bestMedal: bestMedal(prev?.bestMedal ?? null, medal),
      timesCompleted: (prev?.timesCompleted ?? 0) + 1,
    });
    store.setBanner({
      text: `Mission complete — ${this.def.title}${medal ? ` · ${medalLabel(medal)}` : ""}`,
      kind: "success",
      at: Date.now(),
    });
    this.ctx.events.emit("missionCompleted", { missionId: this.def.id, medal });
    this.resolveTimer = SUCCESS_HOLD;
  }

  private applyReward(r: Reward): void {
    switch (r.kind) {
      case "cash":
        this.ctx.economy.addCash(r.amount);
        break;
      case "rep":
        this.ctx.economy.addRep(r.amount);
        break;
      case "weapon":
        this.ctx.economy.giveWeapon(r.weaponId);
        break;
      case "unlockMission":
        progress.unlock(r.missionId);
        break;
      case "item":
        useUiStore
          .getState()
          .pushToast({ id: `mission-item-${Date.now()}`, text: `Received ${r.qty ?? 1}× ${r.itemId}` });
        break;
      case "unlockBusiness":
        // Economy/property subsystem consumes the unlock flag once it lands.
        useUiStore
          .getState()
          .pushToast({ id: `mission-biz-${Date.now()}`, text: `Unlocked business: ${r.businessId}` });
        break;
    }
  }

  private computeMedal(): Medal | null {
    const rules = this.def.medals;
    if (!rules || rules.length === 0) return null;
    const elapsed = this.ctx.now() - this.startTimeS;
    const rank: Record<Medal, number> = { bronze: 1, silver: 2, verano_gold: 3 };
    let best: Medal | null = null;
    for (const rule of rules) {
      const okReq = (rule.requires ?? []).every((t) => this.medalTags.has(t));
      const okTime = rule.underSeconds == null || elapsed <= rule.underSeconds;
      // minAccuracy needs combat accuracy tracking (v2 combat) → treated as satisfied for now.
      if (okReq && okTime && (best == null || rank[rule.medal] > rank[best])) best = rule.medal;
    }
    return best;
  }

  private fail(f: FailState): void {
    const reason = failReason(f);
    const canRetry = this.checkpoint != null && this.def.replayable !== false;
    this.phase = { t: "failed", canRetry };
    if (!canRetry) this.medalTags.clear();
    if (f.kind === "playerDied") this.ctx.events.emit("playerDied", {});
    this.ctx.events.emit("missionFailed", { missionId: this.def.id, reason });
    useMissionStore.getState().setBanner({
      text: canRetry ? `Failed: ${reason} — restarting at checkpoint` : `Mission failed — ${reason}`,
      kind: "failed",
      at: Date.now(),
    });
    this.resolveTimer = canRetry ? RETRY_HOLD : FAIL_HOLD;
  }

  private doRetry(): void {
    director.cleanup(this.missionRef);
    this.spawnedRefs.clear();
    const cp = this.checkpoint;
    if (cp) restore(cp, this.ctx);
    signals.resetAll();
    useMissionStore.getState().setBanner({ text: "Checkpoint", kind: "checkpoint", at: Date.now() });
    this.enterStage(cp ? cp.stageIndex : 0);
  }

  private finalize(): void {
    director.run(this.def.onCleanup ?? [], this.ctx, this.missionRef, this.stageIndex);
    director.cleanup(this.missionRef);
    signals.resetAll();
    this.phase = { t: "cleaned" };
  }

  /** Abort from outside (e.g. player quits mission). */
  abort(): void {
    if (this.phase.t === "cleaned") return;
    this.finalize();
  }

  // ── HUD projection (read by the throttled finish-phase system) ───────────────
  buildHud(): { objectives: HudObjective[]; markers: MissionMarker[]; timer: MissionTimerView | null } {
    const stage = this.stage();
    if (!stage) return { objectives: [], markers: [], timer: null };

    const objectives: HudObjective[] = stage.objectives.map((o, idx) => {
      const state = (this.objState.get(o.id) ?? "pending") as HudObjective["state"];
      const rt = this.objRt.get(o.id);
      return {
        id: o.id,
        label: o.label,
        state,
        optional: objOptional(o) || undefined,
        guard: this.guardIdx.includes(idx) || undefined,
        count: this.objectiveCount(o, rt),
      };
    });

    const markers: MissionMarker[] = [];
    const activeIdx = this.activeGatingIdx();
    if (activeIdx != null) {
      const o = stage.objectives[activeIdx];
      if (o) {
        const pos = objectiveHandlers[o.kind].markerPosition?.(o, this.ctx, this.missionRef) ?? null;
        if (pos) {
          const marker = "marker" in o ? o.marker : undefined;
          markers.push({
            id: `obj:${o.id}`,
            position: pos,
            kind: "objective",
            label: o.label,
            color: marker?.color,
            waypoint: marker?.waypoint ?? true,
          });
        }
      }
    }
    // Guard (protect) follow markers.
    for (const idx of this.guardIdx) {
      const o = stage.objectives[idx];
      if (!o) continue;
      const pos = objectiveHandlers[o.kind].markerPosition?.(o, this.ctx, this.missionRef) ?? null;
      if (pos) markers.push({ id: `guard:${o.id}`, position: pos, kind: "objective", label: o.label, color: "#5fd0ff" });
    }
    // Imperative markers set via `setObjectiveMarker`.
    for (const m of directorMarkers.get(this.missionRef) ?? []) {
      markers.push({ id: `dir:${m.id}`, position: m.position as Vec3, kind: "objective", label: m.label, color: m.color, waypoint: m.waypoint });
    }

    const timer: MissionTimerView | null =
      this.timerRemaining != null && this.stageTimerHud()
        ? { id: this.timerId, remaining: Math.max(0, this.timerRemaining), total: this.timerTotal }
        : null;

    return { objectives, markers, timer };
  }

  private stageTimerHud(): boolean {
    const stage = this.stage();
    return stage?.timer?.hud === true;
  }

  private activeGatingIdx(): number | null {
    const stage = this.stage();
    if (!stage) return null;
    if (this.sequence(stage)) return this.gatingIdx[this.currentGating] ?? null;
    for (const idx of this.gatingIdx) {
      const o = stage.objectives[idx];
      if (o && this.objState.get(o.id) !== "complete") return idx;
    }
    return null;
  }

  private objectiveCount(o: Objective, rt: ObjectiveRuntime | undefined): HudObjective["count"] {
    if (!rt) return undefined;
    if (o.kind === "eliminate") return { have: rt.data.killed ?? 0, need: rt.data.need ?? Math.max(1, rt.baseline) };
    if (o.kind === "collect") return { have: rt.data.collected ?? 0, need: rt.data.need ?? Math.max(1, rt.baseline) };
    if (o.kind === "survive") return { have: Math.floor(rt.elapsed), need: Math.ceil(o.seconds) };
    if (o.kind === "wait") return { have: Math.floor(rt.elapsed), need: Math.ceil(o.seconds) };
    return undefined;
  }
}
