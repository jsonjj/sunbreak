// Zustand mirror of the sim clock for React consumers (HUD clock, settings, debug overlays).
// The ECS `light_clock`/`light_sky` components are the canonical contract; this store is a
// throttled, render-safe projection updated in the `finish` phase. Read it with a selector,
// e.g. `const hour = useTimeOfDay((s) => s.hour)`.
import { create } from "zustand";
import type { Vec3 } from "@sunbreak/shared";

export type DayPhase = "night" | "dawn" | "day" | "dusk";

interface TimeOfDayState {
  hour: number;
  dayAmount: number;
  phase: DayPhase;
  /** Unit direction toward the sun, as a tuple for easy consumption. */
  sun: [number, number, number];
  apply: (hour: number, dayAmount: number, phase: DayPhase, sunDir: Vec3) => void;
}

export const useTimeOfDay = create<TimeOfDayState>((set) => ({
  hour: 8,
  dayAmount: 1,
  phase: "day",
  sun: [0, 1, 0],
  apply: (hour, dayAmount, phase, sunDir) =>
    set({ hour, dayAmount, phase, sun: [sunDir.x, sunDir.y, sunDir.z] }),
}));

export function phaseOf(hour: number, dayAmount: number): DayPhase {
  if (dayAmount > 0.8) return "day";
  if (dayAmount < 0.12) return "night";
  return hour < 12 ? "dawn" : "dusk";
}
