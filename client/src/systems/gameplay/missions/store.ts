// Zustand slice the HUD + minimap read from. The runtime writes transitions here immediately
// (banner/dialogue/status) and the throttled finish-phase system mirrors objectives/markers/timer.

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { Vec3 } from "./schema";
import type { MissionStatus } from "./types";

export type Medal = "bronze" | "silver" | "verano_gold";

export interface HudObjective {
  id: string;
  label: string;
  state: "pending" | "active" | "complete" | "failed";
  optional?: boolean;
  guard?: boolean;
  /** For eliminate/collect progress ("2 / 4"). */
  count?: { have: number; need: number };
}

export interface MissionMarker {
  id: string;
  position: Vec3;
  kind: "objective" | "waypoint" | "start";
  label?: string;
  color?: string;
  waypoint?: boolean;
}

export interface MissionTimerView {
  id?: string;
  remaining: number;
  total: number;
}

export interface MissionBanner {
  text: string;
  kind: "start" | "success" | "failed" | "info" | "checkpoint";
  /** Wall-clock ms when raised (HUD can auto-dismiss). */
  at: number;
}

/** Serializable per-mission progress — this is the save slice. */
export interface MissionProgressEntry {
  status: MissionStatus;
  title: string;
  bestMedal: Medal | null;
  timesCompleted: number;
  /** Start-trigger world position (drives the "available mission" minimap blip). */
  startPos: Vec3 | null;
}

export interface MissionSaveSlice {
  version: 1;
  completed: string[];
  unlocked: string[];
  medals: Record<string, Medal>;
  timesCompleted: Record<string, number>;
}

interface MissionStoreState {
  activeMissionId: string | null;
  activeTitle: string | null;
  activeStageTitle: string | null;
  status: Record<string, MissionProgressEntry>;
  hudObjectives: HudObjective[];
  markers: MissionMarker[];
  timer: MissionTimerView | null;
  banner: MissionBanner | null;
  lastDialogue: { speaker: string; line: string } | null;

  setActive: (p: { id: string | null; title: string | null; stageTitle: string | null }) => void;
  setStageTitle: (title: string | null) => void;
  setObjectives: (objectives: HudObjective[]) => void;
  setMarkers: (markers: MissionMarker[]) => void;
  setTimer: (timer: MissionTimerView | null) => void;
  setBanner: (banner: MissionBanner | null) => void;
  setDialogue: (d: { speaker: string; line: string } | null) => void;
  upsertProgress: (id: string, patch: Partial<MissionProgressEntry>) => void;
  clearActiveHud: () => void;
}

export const useMissionStore = create<MissionStoreState>()(
  subscribeWithSelector((set) => ({
    activeMissionId: null,
    activeTitle: null,
    activeStageTitle: null,
    status: {},
    hudObjectives: [],
    markers: [],
    timer: null,
    banner: null,
    lastDialogue: null,

    setActive: ({ id, title, stageTitle }) =>
      set({ activeMissionId: id, activeTitle: title, activeStageTitle: stageTitle }),
    setStageTitle: (activeStageTitle) => set({ activeStageTitle }),
    setObjectives: (hudObjectives) => set({ hudObjectives }),
    setMarkers: (markers) => set({ markers }),
    setTimer: (timer) => set({ timer }),
    setBanner: (banner) => set({ banner }),
    setDialogue: (lastDialogue) => set({ lastDialogue }),
    upsertProgress: (id, patch) =>
      set((s) => {
        const prev: MissionProgressEntry =
          s.status[id] ??
          { status: "locked", title: id, bestMedal: null, timesCompleted: 0, startPos: null };
        return { status: { ...s.status, [id]: { ...prev, ...patch } } };
      }),
    clearActiveHud: () =>
      set({
        activeMissionId: null,
        activeTitle: null,
        activeStageTitle: null,
        hudObjectives: [],
        markers: [],
        timer: null,
      }),
  })),
);
