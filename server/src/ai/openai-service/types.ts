// Public + internal contract for the OpenAI gateway subsystem (ai/openai-service).
//
// These types are the source of truth for BOTH the HTTP wire format (what the client AI
// subsystems must send/receive) and the in-process API (what other SERVER subsystems —
// npc-personas, dynamic-content, colyseus rooms — call directly). They live in this folder
// (not in @sunbreak/shared) because Wave-2 agents own only their own folder; the integrator
// can later promote any of these into shared if a cross-boundary import is preferred.

/** Which kind of line we are generating. Drives prompt template, caching + token caps. */
export type AiCategory =
  | "npc_dialogue" // interactive, in-character back-and-forth (NOT cached)
  | "ambient_bark" // short one-liner shouted by a ped (cached, high reuse)
  | "mission_brief" // objective/briefing text (cached, medium reuse)
  | "tutorial" // hint/tutorial line (cached, high reuse)
  | "radio_dj"; // radio DJ / station patter (cached, medium reuse)

/** Structured content generators (return validated JSON, non-streaming). */
export type AiContentKind = "mission" | "sidequest" | "radio_ad" | "bark";

/** Where a response came from — identical client code path for all three. */
export type AiSource = "live" | "cache" | "offline";

/** Nameplate/emotion metadata for the dialogue UI. */
export interface SpeakerMeta {
  npcId: string;
  displayName: string;
  color?: string;
  emotion?: string;
}

/** Body of `POST /api/ai/dialogue`. Untrusted — validated with zod at the edge. */
export interface AiDialogueRequest {
  /** Stable per-play-session id used for budgeting + rate limiting. */
  sessionId: string;
  category?: AiCategory;
  npcId?: string;
  personaId?: string;
  /** Omitted on the first turn → the server mints one and returns it in `meta`. */
  conversationId?: string;
  /** Free-text player utterance (treated strictly as data, never instructions). */
  playerText?: string;
  /** A selected scripted choice id (alternative to free text). */
  choiceId?: string;
  /** Scene/world snapshot: district, timeOfDay, wantedLevel, weather, flags… */
  context?: Record<string, string | number | boolean>;
}

/** Body of `POST /api/ai/content` (and its `/:kind` aliases). */
export interface AiContentRequest {
  sessionId: string;
  kind: AiContentKind;
  /** How many items to produce (barks only; clamped server-side). */
  count?: number;
  context?: Record<string, string | number | boolean>;
}

/** Normalized token usage + estimated spend (model-agnostic). */
export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
}

/**
 * One SSE frame from `POST /api/ai/dialogue`. Wire format: each event is a single line
 * `data: <json>\n\n`; heartbeats are SSE comments `: ping\n\n`. The stream terminates with a
 * `done` event followed by the server closing the connection (no `[DONE]` sentinel).
 */
export type AiStreamEvent =
  | { type: "meta"; conversationId: string; source: AiSource; model: string; speaker?: SpeakerMeta }
  | { type: "delta"; text: string }
  | { type: "done"; text: string; source: AiSource; usage?: AiUsage }
  | { type: "error"; message: string; recoverable: boolean };

/** JSON body returned by the non-streaming content route. */
export interface AiContentResponse {
  ok: true;
  kind: AiContentKind;
  source: AiSource;
  data: unknown;
  usage?: AiUsage;
}

// ── In-process programmatic API (for other server subsystems) ───────────────────────────

export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Low-level chat request used by the in-process `chat`/`chatStream` helpers. */
export interface ChatReq {
  messages: ChatMessage[];
  /** `"cheap"` → default model, `"smart"` → smart model, or an explicit model id. */
  model?: "cheap" | "smart" | (string & {});
  maxTokens?: number;
  temperature?: number;
  /** OpenAI `prompt_cache_key` — set to a stable persona id to boost cache hits. */
  cacheKey?: string;
  /** Stable player/session id, forwarded for abuse tracking + budgeting. */
  sessionId?: string;
  signal?: AbortSignal;
}

export interface ChatRes {
  text: string;
  source: AiSource;
  usage?: AiUsage;
}

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
}

/**
 * The service surface consumed IN-PROCESS by sibling subsystems (npc-personas, dynamic-content,
 * server-sim). Mirrors the `AiProxy` shape the npc-personas plan expects.
 */
export interface AiService {
  readonly hasKey: boolean;
  readonly offline: boolean;
  readonly model: string;
  readonly smartModel: string;
  chat(req: ChatReq): Promise<ChatRes>;
  chatStream(req: ChatReq): AsyncIterable<string>;
  moderate(text: string): Promise<ModerationResult>;
  generateContent(req: AiContentRequest): Promise<AiContentResponse>;
}
