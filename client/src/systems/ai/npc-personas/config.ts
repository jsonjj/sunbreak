// Tunables + runtime config for ai/npc-personas. Endpoint + base-url resolution live
// here so the integrator can retarget the server in ONE place.

/** Shared server contract this client speaks to (SSE). */
export const NPC_DIALOGUE_ENDPOINT = "/api/ai/dialogue";

/** Rolling short-term memory: last N committed turns sent to the server. */
export const MEMORY_WINDOW_TURNS = 6;
/** Evict a conversation's memory after this idle time. */
export const MEMORY_TTL_MS = 10 * 60 * 1000;
/** How often the memory sweeper runs. */
export const MEMORY_SWEEP_MS = 60 * 1000;
/** Global cap on tracked conversation memories (bounds RAM). */
export const MAX_ACTIVE_MEMORIES = 64;

/** If no token/meta arrives in this window, abort and fall back to a canned line. */
export const FIRST_TOKEN_TIMEOUT_MS = 8000;
/** Overall per-request ceiling. */
export const REQUEST_TIMEOUT_MS = 30000;

/** Short in-character replies keep latency + cost down. */
export const DEFAULT_MAX_TOKENS = 90;
export const DEFAULT_TEMPERATURE = 0.8;

/** Hard cap on player free-text sent to the server (injection/cost guard). */
export const MAX_PLAYER_CHARS = 240;

/** Simulated stream speed (chars/sec) for greetings + offline canned lines. */
export const FALLBACK_CPS = 45;

interface NpcPersonasConfig {
  /** Gently turn the talking NPC to face the player (guarded; see system.ts). */
  facePlayer: boolean;
  /** Force offline/canned mode — never hits the server. */
  offline: boolean;
  /** Allow free-text player turns to reach the server (else canned-only). */
  freeText: boolean;
  /** Send the full persona card on the first server turn (primes a stateless server). */
  sendPersonaCard: boolean;
  /** Base URL override; defaults to VITE_SERVER_URL, else same-origin (Vite proxy). */
  serverBaseUrl: string;
}

const cfg: NpcPersonasConfig = {
  facePlayer: true,
  offline: false,
  freeText: true,
  sendPersonaCard: true,
  serverBaseUrl: (import.meta.env.VITE_SERVER_URL ?? "").replace(/\/+$/, ""),
};

/** Patch runtime config (e.g. a settings toggle → `configureNpcPersonas({ offline: true })`). */
export function configureNpcPersonas(patch: Partial<NpcPersonasConfig>): void {
  Object.assign(cfg, patch);
  if (typeof cfg.serverBaseUrl === "string") {
    cfg.serverBaseUrl = cfg.serverBaseUrl.replace(/\/+$/, "");
  }
}

export function getNpcConfig(): Readonly<NpcPersonasConfig> {
  return cfg;
}

/** Fully-qualified dialogue endpoint (same-origin `/api/...` in dev via the Vite proxy). */
export function dialogueUrl(): string {
  return cfg.serverBaseUrl + NPC_DIALOGUE_ENDPOINT;
}
