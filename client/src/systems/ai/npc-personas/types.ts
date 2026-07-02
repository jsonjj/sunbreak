// ─────────────────────────────────────────────────────────────────────────────
// ai/npc-personas — public types + the client↔server dialogue contract.
// ─────────────────────────────────────────────────────────────────────────────
// This subsystem is the NPC "brain" on the client: persona/character-card data,
// short-term conversation memory, live world-state injection, and the client that
// streams from the server dialogue proxy (`POST /api/ai/dialogue`, SSE). It never
// touches the OpenAI key/SDK — that is server-only.
import type { WantedLevel } from "@sunbreak/shared";

/** Generic (unnamed) NPC personas resolved from an entity's ped archetype. */
export type NpcArchetype =
  | "bartender"
  | "cabbie"
  | "beat-cop"
  | "shopkeeper"
  | "corner-kid"
  | "local";

/** Coarse emotional state — tints the nameplate and nudges tone. */
export type NpcMood = "neutral" | "friendly" | "wary" | "hostile" | "amused" | "scared";

/** A single authored example exchange used to anchor persona voice (few-shot). */
export interface PersonaFewShot {
  user: string;
  npc: string;
}

/**
 * Data-driven character card. Authored in-house from the SUNBREAK creative canon
 * (original IP). Validated at boot by `personaSchema`.
 */
export interface PersonaCard {
  id: string;
  name: string;
  role: string;
  district?: string;
  region?: string;
  faction?: string;
  /** Set only for the generic archetype cards. */
  archetype?: NpcArchetype;
  personality: string[];
  speechStyle: string;
  knowledge: string[];
  secrets?: string[];
  relationships?: Record<string, string>;
  guardrails: string[];
  /** In-character reactions keyed by the player's wanted level (0..5). */
  wantedReactions?: Partial<Record<WantedLevel, string>>;
  /** Canned opener — served with NO model call (cost control). */
  greeting: string;
  /** Always-available offline/canned lines (no key, offline, rate-limited). */
  fallbackLines: string[];
  fewShot?: PersonaFewShot[];
  /** Short in-character replies keep latency + cost down. */
  maxTokens?: number;
  /** UI hint: nameplate/portrait accent color. */
  color?: string;
  /** UI hint: portrait asset key (dialogue-ui resolves the actual asset). */
  portrait?: string;
  /** One-line voice descriptor (dialect/cadence). */
  voice?: string;
}

/** One committed exchange kept in the rolling short-term memory window. */
export interface DialogueTurn {
  user: string;
  npc: string;
}

/**
 * Terse live world snapshot injected into the prompt. The server trims this to the
 * persona-relevant fields (cop → wanted; bartender → time/district) before sending.
 */
export interface WorldSnapshot {
  lead: "cami" | "mac";
  district: string;
  region: string;
  wantedLevel: WantedLevel;
  /** Free-form: "morning" | "afternoon" | "evening" | "night" | "3:14am". */
  timeOfDay: string;
  weather?: string;
  /** Player↔NPC relationship / trust, 0..100. */
  trust?: number;
  carryingContraband?: boolean;
  /** v4 multiplayer hint. */
  nearbyPlayers?: number;
}

/** UI-facing projection of a persona (what dialogue-ui renders). */
export interface PersonaView {
  id: string;
  name: string;
  role: string;
  faction?: string;
  color?: string;
  portrait?: string;
  greeting: string;
}

// ─── Server contract: POST /api/ai/dialogue (SSE) ──────────────────────────────
// The request my client SENDS and the event shapes it ACCEPTS. Intentionally a
// permissive superset so it interops with the server AI proxy regardless of whether
// it speaks the {type:'delta'} convention (openai-service) or the {t:'token'}
// convention (dialogue protocol). See dialogueClient.ts for the lenient parser.

export type DialogueTurnKind = "greeting" | "reply";

export interface DialogueRequest {
  /** Stable player id — memory key + abuse/budget "user" on the server. */
  sessionId: string;
  /** Server may mint one on the first turn and echo it back via a `meta` frame. */
  conversationId?: string;
  /** Per-request correlation id. */
  requestId: string;
  /** Persona card id (e.g. "sparks"). */
  npcId: string;
  /** Alias of npcId — some server builds read `personaId`. */
  personaId: string;
  /** openai-service `AiCategory`. */
  category: "npc_dialogue";
  kind: DialogueTurnKind;
  /** Player's line ("" for a greeting/opening turn). */
  playerText: string;
  /** Structured world state. */
  worldSnapshot: WorldSnapshot;
  /** Flattened world state (openai-service `context`). */
  context: Record<string, string | number | boolean>;
  /** Client short-term memory window (server may ignore / use its own). */
  history: DialogueTurn[];
  /** Optional: lets a stateless server skip its own registry. Sent once per convo. */
  persona?: PersonaCard;
  maxTokens?: number;
  temperature?: number;
}

export type DialogueSource = "live" | "cache" | "offline";

/** Normalized stream event (after parsing whatever the server emits). */
export type DialogueStreamEvent =
  | { type: "meta"; conversationId?: string; speaker?: Partial<PersonaView>; mode?: "choice" | "input" }
  | { type: "delta"; text: string }
  | { type: "done"; text?: string; source?: DialogueSource }
  | { type: "error"; message: string; recoverable?: boolean };

// ─── Conversation handle (what startConversation returns) ───────────────────────

export type NpcConversationStatus =
  | "greeting" // streaming the canned opener
  | "awaiting_input" // idle, waiting for the player
  | "thinking" // request sent, no tokens yet
  | "streaming" // receiving tokens
  | "error"
  | "closed";

export interface NpcConversationState {
  id: string;
  status: NpcConversationStatus;
  speaker: PersonaView;
  /** The assistant text currently streaming (before it commits to `turns`). */
  streamText: string;
  /** Committed exchanges shown in the log (greeting included, user "" on openers). */
  turns: DialogueTurn[];
  /** Where the last completed reply came from. */
  source: DialogueSource | null;
  /** True if the last turn used the offline/canned bank. */
  offline: boolean;
  mood: NpcMood;
  error?: string;
}

/** Options accepted by `startConversation`. */
export interface StartConversationOptions {
  /** Force a specific persona id regardless of the entity binding. */
  personaId?: string;
  /** Stable player id override (defaults to the persisted session id). */
  sessionId?: string;
  /** Stream the canned greeting immediately on open. Default true. */
  autoGreet?: boolean;
  /** Display-name override for the nameplate. */
  displayName?: string;
}

/**
 * Imperative conversation handle. `dialogue-ui` calls `startConversation(entity)`,
 * renders `getState()`, subscribes for updates, and drives `send`/`close`.
 */
export interface NpcConversation {
  readonly id: string;
  readonly persona: PersonaView;
  /** netId (preferred) or the miniplex entity id, if the target was an entity. */
  readonly entityId: number | undefined;
  getState(): NpcConversationState;
  /** Subscribe to state changes. Fires immediately with the current state. */
  subscribe(listener: (state: NpcConversationState) => void): () => void;
  /** Send a player line; streams the reply. Resolves when the turn completes. */
  send(text: string): Promise<void>;
  /** Re-run the last player line (e.g. after an error). */
  regenerate(): Promise<void>;
  /** Abort any in-flight request without ending the conversation. */
  stop(): void;
  /** End the conversation, abort streams, and release the NPC. */
  close(): void;
}
