import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { CharacterId, type GameStoreState } from "@sunbreak/shared";

interface GameStore extends GameStoreState {
  setPhase: (phase: GameStoreState["phase"]) => void;
  pause: () => void;
  resume: () => void;
  switchCharacter: (character: CharacterId) => void;
  setLoadProgress: (n: number) => void;
}

export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set) => ({
    phase: "playing",
    activeCharacter: CharacterId.Cami,
    loadProgress: 1,
    setPhase: (phase) => set({ phase }),
    pause: () => set({ phase: "paused" }),
    resume: () => set({ phase: "playing" }),
    switchCharacter: (activeCharacter) => set({ activeCharacter }),
    setLoadProgress: (loadProgress) => set({ loadProgress }),
  })),
);
