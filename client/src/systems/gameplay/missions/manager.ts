// Mission manager — the public entry point. Owns registry status (locked/available/active/
// completed), enforces a SINGLE active mission, detects start triggers, ticks the active runtime,
// and projects HUD state. Consumed by the interaction/HUD/mission-select subsystems.

import { useGameStore } from "@/stores/game.store";
import type { MissionDef, Trigger, Vec3 } from "./schema";
import { MISSIONS, getMission } from "./registry";
import { MissionRuntime } from "./runtime";
import { missionCtx } from "./context";
import { missionEvents } from "./events";
import { progress } from "./progress";
import { signals } from "./signals";
import type { MissionStatus } from "./types";
import { useMissionStore, type MissionMarker, type MissionTimerView } from "./store";
import { withinXZ } from "./util";

function triggerStartPos(trigger: Trigger): Vec3 | null {
  if (trigger.kind === "enterArea") return trigger.position;
  if (trigger.kind === "interact") return trigger.position ?? null;
  return null;
}

function computeStatus(def: MissionDef): MissionStatus {
  if (progress.isCompleted(def.id)) return "completed";
  const prereqs = def.prerequisites ?? [];
  const prereqsMet = prereqs.every((id) => progress.isCompleted(id));
  if (prereqsMet || progress.isUnlocked(def.id)) return "available";
  return "locked";
}

class MissionManager {
  private active: MissionRuntime | null = null;
  private hudSig = "";

  init(): void {
    this.refreshStatuses();
  }

  dispose(): void {
    this.active?.abort();
    this.active = null;
  }

  // ── Public API (other subsystems) ──────────────────────────────────────────
  getStatus(id: string): MissionStatus {
    const def = getMission(id);
    return def ? computeStatus(def) : "locked";
  }
  isActive(): boolean {
    return this.active != null;
  }
  activeMissionId(): string | null {
    return this.active?.missionId ?? null;
  }

  /** Begin a mission by id. Returns false if one is already running or the mission isn't available. */
  start(id: string): boolean {
    if (this.active) return false;
    const def = getMission(id);
    if (!def) return false;
    if (computeStatus(def) === "locked") return false;

    signals.resetAll();
    this.active = new MissionRuntime(def, missionCtx);

    const store = useMissionStore.getState();
    store.setActive({ id: def.id, title: def.title, stageTitle: def.stages[0]?.title ?? null });
    store.upsertProgress(def.id, { status: "active", title: def.title });
    store.setBanner({ text: def.title, kind: "start", at: Date.now() });
    missionEvents.emit("missionStarted", { missionId: def.id });
    return true;
  }

  /** "Offer" hook (same as start for now; mission-select / phone can use it). */
  offer(id: string): boolean {
    return this.start(id);
  }

  abort(): void {
    this.active?.abort();
  }

  // ── Per-frame update (called from the update-phase system) ──────────────────
  update(dt: number): void {
    if (useGameStore.getState().phase !== "playing") return;

    if (this.active) {
      this.active.tick(dt);
      if (this.active.isCleaned) this.onMissionEnded();
      return;
    }
    this.checkStartTriggers();
  }

  private onMissionEnded(): void {
    this.active = null;
    this.refreshStatuses();
    useMissionStore.getState().clearActiveHud();
    this.hudSig = "";
  }

  private checkStartTriggers(): void {
    if (!missionCtx.player.exists()) return;
    const playerPos = missionCtx.player.position();
    for (const def of Object.values(MISSIONS)) {
      if (computeStatus(def) !== "available") continue;
      const t = def.startTrigger;
      if (t.kind === "enterArea") {
        if (withinXZ(playerPos, t.position, t.radius)) {
          this.start(def.id);
          return;
        }
      } else if (t.kind === "interact") {
        const proximate = t.position ? withinXZ(playerPos, t.position, t.radius ?? 2.5) : false;
        if (signals.interacts.has(t.targetId) || proximate) {
          this.start(def.id);
          return;
        }
      }
      // manual / phoneCall / missionComplete triggers start via start(id) API.
    }
  }

  /** Recompute every mission's status and seed the store (start-blip positions, titles). */
  refreshStatuses(): void {
    const store = useMissionStore.getState();
    for (const def of Object.values(MISSIONS)) {
      const status = computeStatus(def);
      store.upsertProgress(def.id, {
        status,
        title: def.title,
        startPos: triggerStartPos(def.startTrigger),
        bestMedal: progress.medals.get(def.id) ?? null,
        timesCompleted: progress.timesCompleted.get(def.id) ?? 0,
      });
    }
  }

  // ── HUD projection (called from the throttled finish-phase system) ──────────
  publishHud(): void {
    const store = useMissionStore.getState();
    if (!this.active || this.active.isCleaned) {
      if (this.hudSig !== "") {
        this.hudSig = "";
        store.clearActiveHud();
      }
      return;
    }

    const { objectives, markers, timer } = this.active.buildHud();
    const sig = this.hudSignature(objectives, markers, timer);
    if (sig === this.hudSig) return;
    this.hudSig = sig;

    store.setObjectives(objectives);
    store.setMarkers(markers);
    store.setTimer(timer);
  }

  private hudSignature(
    objectives: { id: string; state: string; count?: { have: number; need: number } }[],
    markers: MissionMarker[],
    timer: MissionTimerView | null,
  ): string {
    const o = objectives.map((x) => `${x.id}:${x.state}:${x.count ? `${x.count.have}/${x.count.need}` : ""}`).join(",");
    const m = markers
      .map((x) => `${x.id}@${x.position[0].toFixed(1)},${x.position[2].toFixed(1)}`)
      .join(",");
    const t = timer ? `${timer.id ?? ""}:${Math.ceil(timer.remaining)}` : "";
    return `${o}|${m}|${t}`;
  }
}

export const missionManager = new MissionManager();
