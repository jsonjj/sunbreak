// Tuning for proximity, pacing, limits and layout. Mirrors the intended
// `shared/src/dialogue/constants.ts` (kept local — Wave-2 forbids editing shared/**).

/** Max distance (m) to a Conversable for the "Press E" prompt. */
export const INTERACT_RANGE = 3.0;
/** Forward-cone dot threshold (~60° half-angle) — must be roughly facing the NPC. */
export const FOV_DOT = 0.5;
/** Inside this range (m) we prompt regardless of facing. */
export const CLOSE_RANGE = 1.5;
/** Proximity scan cadence (ms) — throttled, never per-frame. */
export const PROXIMITY_POLL_MS = 200;

/** Free-text hard cap (chars). */
export const MAX_PLAYER_CHARS = 240;
/** Typewriter reveal rate (characters/second). */
export const REVEAL_CPS = 60;
/** If no `meta`/`token` arrives in time, show a canned fallback + retry/leave. */
export const FIRST_TOKEN_TIMEOUT_MS = 8000;
/** Rendered/kept conversation log cap. */
export const MAX_HISTORY_LINES = 40;
/** How many recent log lines the panel shows above the live line. */
export const VISIBLE_HISTORY_LINES = 3;

/** Default ambient-bark subtitle lifetime (ms). */
export const DEFAULT_SUBTITLE_TTL_MS = 3600;
/** Max simultaneous ambient subtitles. */
export const MAX_SUBTITLES = 3;

/** Shared streaming HTTP contract (owned by the server dialogue route / OpenAI service).
 *  INTEGRATOR: unified onto the canonical openai-service SSE route (was `/api/dialogue/turn`). */
export const DIALOGUE_ENDPOINT = "/api/ai/dialogue";

/** Overlay stacking — above the v0 HUD (z-index 10) so it owns clicks + focus while open. */
export const OVERLAY_Z_INDEX = 40;

/** Synthetic ids used by the UI. */
export const LEAVE_CHOICE_ID = "__leave__";
export const RETRY_CHOICE_ID = "__retry__";
