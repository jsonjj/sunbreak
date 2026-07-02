// Stable per-player session id — the server uses it as the memory key + abuse/budget
// "user". Persisted to localStorage so an NPC "remembers you" across reloads (v4 wires
// this to a real account id).

const STORAGE_KEY = "sunbreak.npc.sessionId";

let cached: string | null = null;

function makeId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getSessionId(): string {
  if (cached) return cached;
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
    const fresh = makeId();
    localStorage.setItem(STORAGE_KEY, fresh);
    cached = fresh;
    return fresh;
  } catch {
    // localStorage blocked (private mode / SSR) — fall back to an in-memory id.
    cached = cached ?? makeId();
    return cached;
  }
}

/** Override the session id (e.g. after login binds a real account id). */
export function setSessionId(id: string): void {
  cached = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}
