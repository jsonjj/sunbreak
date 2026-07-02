// The onboarding store. DOM overlay renders from here (outside the R3F Canvas) so it never
// does per-frame React work. Only `onboardingComplete` + `seenHints` are persisted to
// localStorage (key `sunbreak:onboarding`); everything else is transient session state.
import { create } from "zustand";
import { persist, createJSONStorage, subscribeWithSelector } from "zustand/middleware";
import type { MoveDir } from "./bus";

export type OnbPhase = "idle" | "firstRun" | "intro" | "done";

/** A queued contextual hint, resolved to display-ready text + glyphs. */
export interface ActiveHint {
  id: string;
  text: string;
  glyphs: string[];
  durationMs: number;
}

const STORAGE_KEY = "sunbreak:onboarding";
const STORE_VERSION = 1;

interface PersistedShape {
  onboardingComplete: boolean;
  seenHints: Set<string>;
}

interface OnboardingState extends PersistedShape {
  // ── flow ───────────────────────────────────────────────────────────────
  phase: OnbPhase;
  running: boolean;

  // ── first-run controls tutorial ─────────────────────────────────────────
  stepIndex: number;
  stepId: string | null;
  /** Movement directions observed so far (drives the Move card checkmarks). */
  movedDirs: Set<MoveDir>;
  /** Accumulated look magnitude (radians-ish) for the Look step. */
  lookAmount: number;

  // ── intro mission ("First Gear") ────────────────────────────────────────
  missionId: string | null;
  missionTitleKey: string | null;
  beatIndex: number;
  beatId: string | null;
  objectiveKey: string | null;
  beatGoal: number;
  beatProgress: number;
  markerLabelKey: string | null;
  markerDistance: number | null;

  // ── contextual hints ────────────────────────────────────────────────────
  currentHint: ActiveHint | null;
  hintQueue: ActiveHint[];

  // ── help overlay + view wiring ──────────────────────────────────────────
  helpOpen: boolean;
  /** True while the optional in-world CanvasLayer is mounted (enables real raycast hits). */
  canvasMounted: boolean;

  // ── actions ─────────────────────────────────────────────────────────────
  setPhase: (phase: OnbPhase) => void;
  setRunning: (running: boolean) => void;

  setStep: (stepIndex: number, stepId: string | null) => void;
  addMovedDir: (dir: MoveDir) => void;
  addLook: (amount: number) => void;
  resetStepProgress: () => void;

  startMission: (id: string, titleKey: string) => void;
  setBeat: (beatIndex: number, beatId: string, objectiveKey: string, goal: number) => void;
  setBeatProgress: (n: number) => void;
  setMarker: (labelKey: string | null, distance: number | null) => void;

  markComplete: () => void;
  resetProgress: () => void;

  hasHint: (id: string) => boolean;
  markHintSeen: (id: string) => void;
  enqueueHint: (hint: ActiveHint) => void;
  dismissCurrentHint: () => void;

  openHelp: () => void;
  closeHelp: () => void;
  toggleHelp: () => void;
  setCanvasMounted: (mounted: boolean) => void;
}

const initialTransient = {
  phase: "idle" as OnbPhase,
  running: false,
  stepIndex: 0,
  stepId: null as string | null,
  movedDirs: new Set<MoveDir>(),
  lookAmount: 0,
  missionId: null as string | null,
  missionTitleKey: null as string | null,
  beatIndex: 0,
  beatId: null as string | null,
  objectiveKey: null as string | null,
  beatGoal: 1,
  beatProgress: 0,
  markerLabelKey: null as string | null,
  markerDistance: null as number | null,
  currentHint: null as ActiveHint | null,
  hintQueue: [] as ActiveHint[],
  helpOpen: false,
  canvasMounted: false,
};

export const useOnboardingStore = create<OnboardingState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        onboardingComplete: false,
        seenHints: new Set<string>(),
        ...initialTransient,

        setPhase: (phase) => set({ phase }),
        setRunning: (running) => set({ running }),

        setStep: (stepIndex, stepId) =>
          set({ stepIndex, stepId, movedDirs: new Set(), lookAmount: 0 }),
        addMovedDir: (dir) =>
          set((s) => {
            if (s.movedDirs.has(dir)) return s;
            const movedDirs = new Set(s.movedDirs);
            movedDirs.add(dir);
            return { movedDirs };
          }),
        addLook: (amount) => set((s) => ({ lookAmount: s.lookAmount + amount })),
        resetStepProgress: () => set({ movedDirs: new Set(), lookAmount: 0 }),

        startMission: (missionId, missionTitleKey) =>
          set({ missionId, missionTitleKey, beatIndex: 0, beatProgress: 0 }),
        setBeat: (beatIndex, beatId, objectiveKey, beatGoal) =>
          set({ beatIndex, beatId, objectiveKey, beatGoal, beatProgress: 0 }),
        setBeatProgress: (beatProgress) => set({ beatProgress }),
        setMarker: (markerLabelKey, markerDistance) => set({ markerLabelKey, markerDistance }),

        markComplete: () =>
          set({
            onboardingComplete: true,
            phase: "done",
            running: false,
            objectiveKey: null,
            markerLabelKey: null,
            markerDistance: null,
            missionId: null,
            beatId: null,
          }),
        resetProgress: () => set({ onboardingComplete: false, ...initialTransient }),

        hasHint: (id) => get().seenHints.has(id),
        markHintSeen: (id) =>
          set((s) => {
            if (s.seenHints.has(id)) return s;
            const seenHints = new Set(s.seenHints);
            seenHints.add(id);
            return { seenHints };
          }),
        enqueueHint: (hint) =>
          set((s) =>
            s.currentHint ? { hintQueue: [...s.hintQueue, hint] } : { currentHint: hint },
          ),
        dismissCurrentHint: () =>
          set((s) => {
            const [next, ...rest] = s.hintQueue;
            return { currentHint: next ?? null, hintQueue: rest };
          }),

        openHelp: () => set({ helpOpen: true }),
        closeHelp: () => set({ helpOpen: false }),
        toggleHelp: () => set((s) => ({ helpOpen: !s.helpOpen })),
        setCanvasMounted: (canvasMounted) => set({ canvasMounted }),
      }),
      {
        name: STORAGE_KEY,
        version: STORE_VERSION,
        storage: createJSONStorage<PersistedShape>(() => localStorage, {
          replacer: (_k, v) => (v instanceof Set ? { __set: [...v] } : v),
          reviver: (_k, v) => {
            if (v && typeof v === "object" && "__set" in v && Array.isArray((v as { __set: unknown[] }).__set)) {
              return new Set((v as { __set: unknown[] }).__set);
            }
            return v;
          },
        }),
        // Persist ONLY the two durable flags; never the transient session state.
        partialize: (s): PersistedShape => ({
          onboardingComplete: s.onboardingComplete,
          seenHints: s.seenHints,
        }),
      },
    ),
  ),
);
