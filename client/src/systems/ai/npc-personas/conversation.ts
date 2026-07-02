// The conversation orchestrator. `startConversation(entity)` returns an imperative
// handle that dialogue-ui drives: it wires persona → memory → world-state → the SSE
// server client, with a canned offline fallback so dialogue always works. Only ONE
// conversation is "active" at a time (mirrored into the zustand store for the UI).
import type { ClientEntity } from "@/ecs/clientEntity";
import { world } from "@/ecs/world";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  FIRST_TOKEN_TIMEOUT_MS,
  MAX_PLAYER_CHARS,
  getNpcConfig,
} from "./config";
import { streamDialogue } from "./dialogueClient";
import { chooseFallback, chooseGreeting, simulateStream } from "./fallback";
import { memory, memoryKey } from "./memory";
import { personaView, resolvePersonaForEntity } from "./personaRegistry";
import { getSessionId } from "./session";
import { clearActiveConversationState, setActiveConversationState } from "./store";
import { clearInConversation, setInConversation } from "./talkable";
import type {
  DialogueRequest,
  DialogueSource,
  DialogueTurn,
  NpcConversation,
  NpcConversationState,
  PersonaCard,
  PersonaView,
  StartConversationOptions,
  WorldSnapshot,
} from "./types";
import { collectWorldSnapshot, flattenSnapshot } from "./worldState";

type TurnReason = "stop" | "close" | "timeout" | null;

interface Turn {
  ac: AbortController;
  reason: TurnReason;
}

function genId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitize(text: string): string {
  // Strip control chars, collapse, and cap length (cost + prompt-injection surface).
  return text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_PLAYER_CHARS);
}

class Conversation implements NpcConversation {
  readonly id: string;
  readonly persona: PersonaView;
  readonly entityId: number | undefined;

  private readonly card: PersonaCard;
  private readonly entity: ClientEntity | undefined;
  private readonly sessionId: string;
  private readonly memKey: string;

  private state: NpcConversationState;
  private readonly listeners = new Set<(state: NpcConversationState) => void>();
  private currentTurn: Turn | null = null;
  private serverConversationId: string | undefined;
  private lastUserText = "";
  private sentPersona = false;
  private active = true;

  constructor(card: PersonaCard, entity: ClientEntity | undefined, opts?: StartConversationOptions) {
    this.card = card;
    this.entity = entity;
    this.id = genId();
    this.sessionId = opts?.sessionId ?? getSessionId();
    this.memKey = memoryKey(this.sessionId, card.id);
    this.entityId = entity?.netId ?? (entity ? world.id(entity) : undefined);
    this.persona = personaView(card, opts?.displayName ?? entity?.npc_displayName);
    this.state = {
      id: this.id,
      status: "awaiting_input",
      speaker: this.persona,
      streamText: "",
      turns: [],
      source: null,
      offline: false,
      mood: entity?.npc_mood ?? "neutral",
    };
    if (entity) setInConversation(entity);
  }

  getState(): NpcConversationState {
    return this.state;
  }

  subscribe(listener: (state: NpcConversationState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private set(patch: Partial<NpcConversationState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        /* a bad subscriber must not break the stream */
      }
    }
    if (activeConversation === this) setActiveConversationState(this.state);
  }

  /** Supersede any in-flight turn (silent cancel) and start a fresh one. */
  private newTurn(): Turn {
    if (this.currentTurn) {
      if (!this.currentTurn.reason) this.currentTurn.reason = "stop";
      this.currentTurn.ac.abort();
    }
    const turn: Turn = { ac: new AbortController(), reason: null };
    this.currentTurn = turn;
    return turn;
  }

  private applySpeaker(sp: Partial<PersonaView>): void {
    const next: PersonaView = { ...this.state.speaker };
    if (sp.id) next.id = sp.id;
    if (sp.name) next.name = sp.name;
    if (sp.role) next.role = sp.role;
    if (sp.color) next.color = sp.color;
    if (sp.portrait) next.portrait = sp.portrait;
    this.set({ speaker: next });
  }

  private commit(
    turn: Turn,
    userText: string,
    npcText: string,
    source: DialogueSource | null,
    offline: boolean,
    toMemory: boolean,
  ): void {
    if (this.currentTurn !== turn) return; // superseded
    const dialogueTurn: DialogueTurn = { user: userText, npc: npcText };
    if (toMemory) memory.push(this.memKey, dialogueTurn);
    if (this.entity) this.entity.npc_lastTalkedMs = Date.now();
    this.currentTurn = null;
    this.set({
      turns: [...this.state.turns, dialogueTurn],
      streamText: "",
      status: "awaiting_input",
      source,
      offline,
      error: undefined,
    });
  }

  /** Stream the canned opener (no model call — greetings are free). */
  async greet(): Promise<void> {
    if (!this.active) return;
    const snapshot = collectWorldSnapshot(this.entity, this.card);
    const line = chooseGreeting(this.card, snapshot);
    const turn = this.newTurn();
    let acc = "";
    this.set({ status: "greeting", streamText: "" });
    await simulateStream(line, (chunk) => {
      acc += chunk;
      this.set({ streamText: acc });
    }, turn.ac.signal);
    if (this.currentTurn !== turn) return;
    if (turn.ac.signal.aborted) {
      if (this.active) this.set({ status: "awaiting_input", streamText: "" });
      return;
    }
    // Greeting shows as the first NPC line but is NOT stored as server memory.
    this.currentTurn = null;
    this.set({
      turns: [...this.state.turns, { user: "", npc: acc.trim() || line }],
      streamText: "",
      status: "awaiting_input",
      source: null,
      offline: false,
    });
  }

  async send(rawText: string): Promise<void> {
    if (!this.active) return;
    const text = sanitize(rawText);
    if (!text) return;
    this.lastUserText = text;

    const cfg = getNpcConfig();
    const snapshot = collectWorldSnapshot(this.entity, this.card);
    const turn = this.newTurn();
    this.set({ status: "thinking", streamText: "", error: undefined });

    // Offline / choice-only mode: never touch the server.
    if (cfg.offline || !cfg.freeText) {
      await this.fallbackTurn(turn, text, snapshot);
      return;
    }

    const req: DialogueRequest = {
      sessionId: this.sessionId,
      conversationId: this.serverConversationId,
      requestId: genId(),
      npcId: this.card.id,
      personaId: this.card.id,
      category: "npc_dialogue",
      kind: "reply",
      playerText: text,
      worldSnapshot: snapshot,
      context: flattenSnapshot(snapshot, this.card),
      history: memory.window(this.memKey).turns,
      persona: cfg.sendPersonaCard && !this.sentPersona ? this.card : undefined,
      maxTokens: this.card.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: DEFAULT_TEMPERATURE,
    };

    const { iterator, abort } = streamDialogue(req, turn.ac.signal);
    let gotToken = false;
    const timeout = setTimeout(() => {
      if (!gotToken) {
        turn.reason = "timeout";
        abort();
      }
    }, FIRST_TOKEN_TIMEOUT_MS);

    let full = "";
    let source: DialogueSource = "live";
    try {
      for await (const ev of iterator) {
        if (ev.type === "meta") {
          if (ev.conversationId) this.serverConversationId = ev.conversationId;
          if (ev.speaker) this.applySpeaker(ev.speaker);
        } else if (ev.type === "delta") {
          if (!gotToken) {
            gotToken = true;
            clearTimeout(timeout);
            this.set({ status: "streaming" });
          }
          full += ev.text;
          this.set({ streamText: full });
        } else if (ev.type === "done") {
          if (ev.source) source = ev.source;
          if (!gotToken && ev.text) {
            full = ev.text;
            this.set({ streamText: full });
          }
        } else if (ev.type === "error") {
          throw new Error(ev.message);
        }
      }
      clearTimeout(timeout);
      if (this.currentTurn !== turn) return; // superseded

      const reply = full.trim();
      if (!reply) {
        await this.fallbackTurn(turn, text, snapshot);
        return;
      }
      this.sentPersona = true;
      this.commit(turn, text, reply, source, source === "offline", true);
    } catch {
      clearTimeout(timeout);
      if (this.currentTurn !== turn) return; // superseded by a newer turn
      if (turn.reason === "stop" || turn.reason === "close") {
        if (this.active) this.set({ status: "awaiting_input", streamText: "" });
        return;
      }
      // Network / timeout / server error → canned fallback (dialogue always works).
      await this.fallbackTurn(turn, text, snapshot);
    }
  }

  private async fallbackTurn(turn: Turn, userText: string, snapshot: WorldSnapshot): Promise<void> {
    if (!this.active || this.currentTurn !== turn) return;
    // Fresh signal so a prior timeout-abort doesn't cancel the canned reply, while
    // stop()/close() can still interrupt it.
    turn.ac = new AbortController();
    turn.reason = null;
    const line = chooseFallback(this.card, snapshot);
    let acc = "";
    this.set({ status: "streaming", streamText: "" });
    await simulateStream(line, (chunk) => {
      acc += chunk;
      this.set({ streamText: acc });
    }, turn.ac.signal);
    if (this.currentTurn !== turn) return;
    if (turn.ac.signal.aborted) {
      if (this.active) this.set({ status: "awaiting_input", streamText: "" });
      return;
    }
    this.commit(turn, userText, acc.trim() || line, "offline", true, true);
  }

  async regenerate(): Promise<void> {
    if (this.lastUserText) await this.send(this.lastUserText);
  }

  stop(): void {
    const turn = this.currentTurn;
    if (turn) {
      if (!turn.reason) turn.reason = "stop";
      turn.ac.abort();
      this.currentTurn = null;
    }
    if (this.active) this.set({ status: "awaiting_input", streamText: "" });
  }

  close(): void {
    if (!this.active) return;
    const turn = this.currentTurn;
    if (turn) {
      turn.reason = "close";
      turn.ac.abort();
    }
    this.currentTurn = null;
    this.active = false;
    if (this.entity) {
      clearInConversation(this.entity);
      this.entity.npc_lastTalkedMs = Date.now();
    }
    this.set({ status: "closed", streamText: "" });
    if (activeConversation === this) {
      activeConversation = null;
      clearActiveConversationState();
    }
  }
}

let activeConversation: NpcConversation | null = null;

/** The currently-open conversation, or null. */
export function getActiveConversation(): NpcConversation | null {
  return activeConversation;
}

/**
 * Open a conversation with an NPC entity (or a bare persona id) and return a handle.
 * dialogue-ui consumes this: render `getState()`, `subscribe()` for updates, then
 * `send()` / `stop()` / `close()`. Any previously-active conversation is closed first.
 */
export function startConversation(
  target: ClientEntity | string,
  opts?: StartConversationOptions,
): NpcConversation {
  const entity = typeof target === "string" ? undefined : target;
  const personaId = typeof target === "string" ? target : opts?.personaId;
  const card = resolvePersonaForEntity(entity, personaId);

  if (activeConversation) activeConversation.close();

  const conversation = new Conversation(card, entity, opts);
  activeConversation = conversation;
  setActiveConversationState(conversation.getState());

  if (opts?.autoGreet !== false) void conversation.greet();
  return conversation;
}
