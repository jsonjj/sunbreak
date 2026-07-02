// Persistent progress — the source of truth for completion/unlocks/medals and the serializable
// SAVE SLICE the save subsystem reads/writes. The Zustand store is the derived view; this is data.

import type { Medal, MissionSaveSlice } from "./store";

const MEDAL_RANK: Record<Medal, number> = { bronze: 1, silver: 2, verano_gold: 3 };

export function bestMedal(a: Medal | null, b: Medal | null): Medal | null {
  if (!a) return b;
  if (!b) return a;
  return MEDAL_RANK[a] >= MEDAL_RANK[b] ? a : b;
}

class Progress {
  completed = new Set<string>();
  unlocked = new Set<string>();
  medals = new Map<string, Medal>();
  timesCompleted = new Map<string, number>();

  markCompleted(id: string, medal: Medal | null): void {
    this.completed.add(id);
    this.timesCompleted.set(id, (this.timesCompleted.get(id) ?? 0) + 1);
    if (medal) this.medals.set(id, bestMedal(this.medals.get(id) ?? null, medal) ?? medal);
  }

  unlock(id: string): void {
    this.unlocked.add(id);
  }

  isCompleted(id: string): boolean {
    return this.completed.has(id);
  }
  isUnlocked(id: string): boolean {
    return this.unlocked.has(id);
  }

  /** Serialize for the save subsystem. */
  export(): MissionSaveSlice {
    return {
      version: 1,
      completed: [...this.completed],
      unlocked: [...this.unlocked],
      medals: Object.fromEntries(this.medals),
      timesCompleted: Object.fromEntries(this.timesCompleted),
    };
  }

  /** Restore from a save slice (called by the save subsystem on load). */
  import(slice: MissionSaveSlice | null | undefined): void {
    this.completed = new Set(slice?.completed ?? []);
    this.unlocked = new Set(slice?.unlocked ?? []);
    this.medals = new Map(Object.entries(slice?.medals ?? {}) as [string, Medal][]);
    this.timesCompleted = new Map(Object.entries(slice?.timesCompleted ?? {}));
  }
}

export const progress = new Progress();
