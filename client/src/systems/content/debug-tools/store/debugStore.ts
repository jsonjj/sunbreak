// useDebugStore — the flag/state hub for the debug layer. Every subsystem can read this to
// gate dev-only behaviour; the panels and overlay subscribe to it for their visibility.
//
// Perf metrics are pushed here (throttled) by the in-canvas PerfBridge so the DOM HUD and the
// `perf` console command can read them without touching the R3F tree.

import { create } from "zustand";
import { persist, createJSONStorage, subscribeWithSelector } from "zustand/middleware";

export type OverlayMode = "off" | "minimal" | "full";

export interface PerfMetrics {
  fps: number;
  ms: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  /** Chrome-only JS heap in MB; null elsewhere. */
  heapMB: number | null;
}

/** Boolean flags that a plain `toggle(key)` can flip. */
export type DebugToggle = "inspector" | "console" | "leva" | "physicsDebug" | "god" | "noclip";

export interface DebugState {
  /** r3f-perf overlay mode; `F3` cycles off -> minimal -> full. */
  overlay: OverlayMode;
  inspector: boolean;
  console: boolean;
  leva: boolean;
  physicsDebug: boolean;
  god: boolean;
  noclip: boolean;
  /** Time-scale hint (1 = normal). Gameplay systems may read this; not force-applied here. */
  slowmo: number;
  /** miniplex entity id selected in the inspector, or null. */
  selected: number | null;
  metrics: PerfMetrics;

  cycleOverlay: () => void;
  setOverlay: (mode: OverlayMode) => void;
  toggle: (key: DebugToggle) => void;
  set: (patch: Partial<DebugState>) => void;
  setMetrics: (metrics: PerfMetrics) => void;
  select: (id: number | null) => void;
}

const OVERLAY_CYCLE: OverlayMode[] = ["off", "minimal", "full"];

const initialMetrics: PerfMetrics = {
  fps: 0,
  ms: 0,
  calls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  heapMB: null,
};

export const useDebugStore = create<DebugState>()(
  subscribeWithSelector(
    persist(
      (set) => ({
        overlay: "off",
        inspector: false,
        console: false,
        leva: false,
        physicsDebug: false,
        god: false,
        noclip: false,
        slowmo: 1,
        selected: null,
        metrics: initialMetrics,

        cycleOverlay: () =>
          set((s) => {
            const next = OVERLAY_CYCLE[(OVERLAY_CYCLE.indexOf(s.overlay) + 1) % OVERLAY_CYCLE.length];
            return { overlay: next ?? "off" };
          }),
        setOverlay: (overlay) => set({ overlay }),
        toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<DebugState>),
        set: (patch) => set(patch),
        setMetrics: (metrics) => set({ metrics }),
        select: (selected) => set({ selected }),
      }),
      {
        name: "sunbreak:debug:ui",
        storage: createJSONStorage(() => localStorage),
        // Persist only the panel/overlay layout — never gameplay cheats or transient metrics.
        partialize: (s) => ({
          overlay: s.overlay,
          inspector: s.inspector,
          console: s.console,
          leva: s.leva,
          physicsDebug: s.physicsDebug,
          slowmo: s.slowmo,
        }),
      },
    ),
  ),
);
