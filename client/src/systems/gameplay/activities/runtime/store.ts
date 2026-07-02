// Zustand store mirroring the active run for the HUD. This is the read surface the UI/HUD
// subsystem (or the integrator) renders — an <ActivityHUD> reads timer/progress/score/banner
// from here. Written only by the runtime; components subscribe to narrow slices.

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { ActivityKind, RunState } from "../types";

export interface OfferView {
  activityId: string;
  name: string;
  blurb?: string;
  rewardText: string;
}

export interface ActivityBanner {
  kind: "success" | "fail" | "info";
  text: string;
  /** performance.now() when shown (HUD can auto-dismiss). */
  at: number;
}

export interface ActivityRunView {
  runId: string;
  activityId: string;
  name: string;
  kind: ActivityKind;
  state: RunState;
  objectiveText: string;
  progress: number;
  total: number;
  score: number;
  /** Remaining "Go!" countdown in seconds (ceil), 0 when not counting down. */
  countdown: number;
  /** Remaining time in seconds, or null when untimed. */
  timeRemaining: number | null;
  elapsedMs: number;
}

interface ActivityStore {
  run: ActivityRunView | null;
  offer: OfferView | null;
  banner: ActivityBanner | null;
  /** activityId → best result (ms for timed kinds, score for rampage). */
  best: Record<string, number>;
  /** Reward log for anything the econ fallback could not fully apply (xp/unlocks). */
  log: string[];

  setRun: (run: ActivityRunView | null) => void;
  patchRun: (patch: Partial<ActivityRunView>) => void;
  setOffer: (offer: OfferView | null) => void;
  setBanner: (banner: ActivityBanner | null) => void;
  setBest: (activityId: string, value: number) => void;
  appendLog: (line: string) => void;
}

export const useActivityStore = create<ActivityStore>()(
  subscribeWithSelector((set) => ({
    run: null,
    offer: null,
    banner: null,
    best: {},
    log: [],

    setRun: (run) => set({ run }),
    patchRun: (patch) => set((s) => (s.run ? { run: { ...s.run, ...patch } } : {})),
    setOffer: (offer) => set({ offer }),
    setBanner: (banner) => set({ banner }),
    setBest: (activityId, value) => set((s) => ({ best: { ...s.best, [activityId]: value } })),
    appendLog: (line) => set((s) => ({ log: [...s.log.slice(-49), line] })),
  })),
);
