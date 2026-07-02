// Per-contact chat threads, kept in a small Zustand store so history survives closing/reopening
// the phone within a session. (v3 adds server-side SQLite persistence via /api/npc/chat.)
import { create } from "zustand";
import type { ChatRole } from "./npcClient";

export interface ThreadMessage {
  id: string;
  role: ChatRole;
  content: string;
  pending?: boolean;
}

interface ThreadState {
  threads: Record<string, ThreadMessage[]>;
  add: (npcId: string, msg: ThreadMessage) => void;
  appendDelta: (npcId: string, msgId: string, delta: string) => void;
  finalize: (npcId: string, msgId: string) => void;
  reset: (npcId: string) => void;
}

let seq = 0;
export const nextMsgId = (): string => `m${++seq}-${Date.now().toString(36)}`;

export const useThreads = create<ThreadState>((set) => ({
  threads: {},
  add: (npcId, msg) =>
    set((s) => ({ threads: { ...s.threads, [npcId]: [...(s.threads[npcId] ?? []), msg] } })),
  appendDelta: (npcId, msgId, delta) =>
    set((s) => ({
      threads: {
        ...s.threads,
        [npcId]: (s.threads[npcId] ?? []).map((m) =>
          m.id === msgId ? { ...m, content: m.content + delta } : m,
        ),
      },
    })),
  finalize: (npcId, msgId) =>
    set((s) => ({
      threads: {
        ...s.threads,
        [npcId]: (s.threads[npcId] ?? []).map((m) =>
          m.id === msgId ? { ...m, pending: false } : m,
        ),
      },
    })),
  reset: (npcId) => set((s) => ({ threads: { ...s.threads, [npcId]: [] } })),
}));
