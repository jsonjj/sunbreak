// Short-term conversation memory — a rolling per-(player,npc) window kept client-side.
// Keyed by `${sessionId}:${npcId}` so an NPC "remembers" you within a session. Bounded
// by a window size, a TTL sweeper, and a global cap. (v4 moves this server-side/SQLite.)
import { MAX_ACTIVE_MEMORIES, MEMORY_TTL_MS, MEMORY_WINDOW_TURNS } from "./config";
import type { DialogueTurn } from "./types";

interface MemoryEntry {
  turns: DialogueTurn[];
  turnCount: number;
  lastActivityMs: number;
  /** Reserved for cheap summarization of folded-out turns (v3+). */
  summary?: string;
}

const store = new Map<string, MemoryEntry>();

export function memoryKey(sessionId: string, npcId: string): string {
  return `${sessionId}:${npcId}`;
}

function ensure(key: string): MemoryEntry {
  let entry = store.get(key);
  if (!entry) {
    entry = { turns: [], turnCount: 0, lastActivityMs: Date.now() };
    store.set(key, entry);
  }
  return entry;
}

function enforceCap(): void {
  if (store.size <= MAX_ACTIVE_MEMORIES) return;
  let oldestKey: string | undefined;
  let oldest = Number.POSITIVE_INFINITY;
  for (const [k, e] of store) {
    if (e.lastActivityMs < oldest) {
      oldest = e.lastActivityMs;
      oldestKey = k;
    }
  }
  if (oldestKey) store.delete(oldestKey);
}

export const memory = {
  /** The last N turns (plus any summary) to send to the server. */
  window(key: string): { turns: DialogueTurn[]; summary?: string } {
    const entry = store.get(key);
    if (!entry) return { turns: [] };
    entry.lastActivityMs = Date.now();
    return { turns: entry.turns.slice(-MEMORY_WINDOW_TURNS), summary: entry.summary };
  },

  /** Commit one completed exchange. */
  push(key: string, turn: DialogueTurn): void {
    const entry = ensure(key);
    entry.turns.push(turn);
    // Keep a little history beyond the window for future summarization, but bounded.
    if (entry.turns.length > MEMORY_WINDOW_TURNS * 2) {
      entry.turns = entry.turns.slice(-MEMORY_WINDOW_TURNS * 2);
    }
    entry.turnCount += 1;
    entry.lastActivityMs = Date.now();
    enforceCap();
  },

  turnCount(key: string): number {
    return store.get(key)?.turnCount ?? 0;
  },

  reset(key: string): void {
    store.delete(key);
  },

  /** Evict idle conversations. Called on an interval from the subsystem init(). */
  sweep(): void {
    const now = Date.now();
    for (const [k, e] of store) {
      if (now - e.lastActivityMs > MEMORY_TTL_MS) store.delete(k);
    }
  },

  size(): number {
    return store.size;
  },
};
