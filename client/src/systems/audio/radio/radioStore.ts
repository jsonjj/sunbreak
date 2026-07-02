// Zustand store — the UI/HUD-facing mirror of radio state. `powerPref`, `stationIndex` and
// `volume` are USER intent (written by input + persistence + HUD); the rest is a read-only mirror
// written by `radioSystem`/`RadioEngine`. The HUD (a separate subsystem) can subscribe to render a
// station wheel / now-playing ticker without this subsystem hand-mounting any UI.
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { NowPlaying, RadioStatus } from "./types";
import { STATIONS, wrapStationIndex } from "./stations";

export interface RadioStoreState {
  /** User's on/off intent (audibility is still gated to being in a vehicle). */
  powerPref: boolean;
  /** Selected station index into `STATIONS`. */
  stationIndex: number;
  /** User radio-volume trim 0..1 (rides on top of the audio mixer's radio level). */
  volume: number;

  /** Mirror: radio is actually playing right now (in-car + powered). */
  audible: boolean;
  /** Mirror: shared audio context is unlocked. */
  audioReady: boolean;
  /** Mirror: high-level playback status. */
  status: RadioStatus;
  /** Mirror: currently playing element (or null). */
  nowPlaying: NowPlaying | null;

  // ── user actions ──
  setPowerPref: (on: boolean) => void;
  togglePower: () => void;
  setStationIndex: (index: number) => void;
  nextStation: () => void;
  prevStation: () => void;
  setVolume: (v: number) => void;

  /** Internal: batched mirror write from the ECS glue / engine. */
  _mirror: (patch: Partial<RadioMirror>) => void;
}

type RadioMirror = Pick<
  RadioStoreState,
  "audible" | "audioReady" | "status" | "nowPlaying" | "stationIndex"
>;

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

export const useRadioStore = create<RadioStoreState>()(
  subscribeWithSelector((set) => ({
    powerPref: false,
    stationIndex: 0,
    volume: 0.9,

    audible: false,
    audioReady: false,
    status: "off",
    nowPlaying: null,

    setPowerPref: (on) => set({ powerPref: on }),
    togglePower: () => set((s) => ({ powerPref: !s.powerPref })),
    setStationIndex: (index) => set({ stationIndex: wrapStationIndex(index), powerPref: true }),
    nextStation: () =>
      set((s) => ({ stationIndex: wrapStationIndex(s.stationIndex + 1), powerPref: true })),
    prevStation: () =>
      set((s) => ({ stationIndex: wrapStationIndex(s.stationIndex - 1), powerPref: true })),
    setVolume: (v) => set({ volume: clamp01(v) }),

    _mirror: (patch) => set(patch),
  })),
);

/** Convenience selector: the currently selected station definition. */
export const selectStation = (s: RadioStoreState) => STATIONS[wrapStationIndex(s.stationIndex)];
