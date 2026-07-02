// The dialogue state machine — its OWN Zustand store, isolated from the 3D game store
// so streaming tokens never re-render the R3F scene. Owns: status transitions, the
// streamed line (paced via `reveal`), choices, history, the ambient-subtitle queue,
// nearby-NPC slice, and the conversation lifecycle (open → turns → close).
//
//   idle → opening → streaming → (awaiting_choice | awaiting_input) → …loop… → closing→idle

import { create } from "zustand";
import {
  DEFAULT_SUBTITLE_TTL_MS,
  FIRST_TOKEN_TIMEOUT_MS,
  LEAVE_CHOICE_ID,
  MAX_HISTORY_LINES,
  MAX_PLAYER_CHARS,
  MAX_SUBTITLES,
  RETRY_CHOICE_ID,
} from "./constants";
import {
  makePlayerTextSchema,
  type Conversable,
  type DialogueChoice,
  type DialogueMode,
  type DialogueProvider,
  type DialogueTurnRequest,
  type SpeakerMeta,
} from "./contract";
import { resolveProvider } from "./provider";
import { Reveal } from "./reveal";
import { dialoguePause } from "./pause";
import { dialogueEmitter, type DialogueEndReason } from "./events";

export type DialogueStatus =
  | "idle"
  | "opening"
  | "streaming"
  | "awaiting_choice"
  | "awaiting_input"
  | "closing";

export interface HistoryLine {
  id: string;
  speaker: SpeakerMeta;
  text: string;
  isPlayer?: boolean;
}

export interface ActiveSubtitle {
  id: string;
  speaker: SpeakerMeta;
  text: string;
  expiresAt: number;
}

/** A talk target found by the proximity scan (the ECS `Conversable` + live distance). */
export interface NearbyConversable extends Conversable {
  netId?: number;
  distance: number;
}

export interface StartOptions {
  npcId: string;
  personaId?: string;
  displayName?: string;
  sceneContext?: Record<string, unknown>;
}

interface DialogueState {
  // ── public reactive state ────────────────────────────────────────────────
  status: DialogueStatus;
  conversationId: string | null;
  speaker: SpeakerMeta | null;
  mode: DialogueMode;
  /** The currently-revealed portion of the active line (paced by `reveal`). */
  streamText: string;
  choices: DialogueChoice[];
  history: HistoryLine[];
  subtitles: ActiveSubtitle[];
  error: string | null;
  freeTextEnabled: boolean;
  nearby: NearbyConversable | null;

  // ── internals (underscored; not for UI subscription) ─────────────────────
  _abort: AbortController | null;
  _provider: DialogueProvider | null;
  _npc: { npcId: string; personaId?: string } | null;
  _sceneContext: Record<string, unknown> | null;
  _firstTokenTimer: ReturnType<typeof setTimeout> | null;
  _subtitleTimers: Map<string, ReturnType<typeof setTimeout>>;
  _seq: number;

  // ── derived getters ──────────────────────────────────────────────────────
  isOpen: () => boolean;
  isBlockingInput: () => boolean;
  isRevealComplete: () => boolean;

  // ── actions ──────────────────────────────────────────────────────────────
  setNearby: (ref: NearbyConversable | null) => void;
  open: (opts: StartOptions) => void;
  pick: (choiceId: string) => void;
  sendText: (text: string) => void;
  skipReveal: () => void;
  setFreeTextEnabled: (v: boolean) => void;
  pushSubtitle: (sub: { speaker: SpeakerMeta; text: string; ttlMs?: number }) => void;
  close: (reason?: DialogueEndReason) => void;
}

// Module-scope singletons + pure helpers (one store, one reveal pacer).
const reveal = new Reveal();

let uidSeq = 0;
const uid = (): string => `dlg_${(uidSeq++).toString(36)}`;

const PLAYER_SPEAKER: SpeakerMeta = { npcId: "player", displayName: "You", color: "#ffd166" };

const capHistory = (h: HistoryLine[]): HistoryLine[] =>
  h.length > MAX_HISTORY_LINES ? h.slice(h.length - MAX_HISTORY_LINES) : h;

/** Guarantee a "Leave" exit unless a choice already ends the conversation. */
const withLeave = (choices: DialogueChoice[]): DialogueChoice[] =>
  choices.some((c) => c.endsConversation || c.id === LEAVE_CHOICE_ID)
    ? choices
    : [...choices, { id: LEAVE_CHOICE_ID, label: "Leave", endsConversation: true }];

export const useDialogueStore = create<DialogueState>((set, get) => {
  // Reveal flushes at most once per animation frame → single setState, no per-token churn.
  reveal.onFlush = (text) => set({ streamText: text });

  const clearWatchdog = (): void => {
    const t = get()._firstTokenTimer;
    if (t !== null) {
      clearTimeout(t);
      set({ _firstTokenTimer: null });
    }
  };

  const commitLine = (): void => {
    const text = reveal.full.trim();
    const speaker = get().speaker;
    if (!text || !speaker) return;
    const line: HistoryLine = { id: uid(), speaker, text };
    set((st) => ({ history: capHistory([...st.history, line]) }));
    dialogueEmitter.emit("line", { speaker, text, emotion: speaker.emotion });
  };

  const handleError = (message: string): void => {
    clearWatchdog();
    set({
      status: "awaiting_choice",
      error: message,
      choices: [
        { id: RETRY_CHOICE_ID, label: "Try again" },
        { id: LEAVE_CHOICE_ID, label: "Leave", endsConversation: true },
      ],
    });
  };

  const removeSubtitle = (id: string): void => {
    const timers = get()._subtitleTimers;
    const t = timers.get(id);
    if (t) {
      clearTimeout(t);
      timers.delete(id);
    }
    set((st) => ({ subtitles: st.subtitles.filter((x) => x.id !== id) }));
  };

  const runTurn = async (extra: { choiceId?: string; playerText?: string }): Promise<void> => {
    const npc = get()._npc;
    const ac = get()._abort;
    const provider = get()._provider;
    if (!npc || !ac || !provider) return;
    const seq = get()._seq;

    const req: DialogueTurnRequest = { npcId: npc.npcId };
    if (npc.personaId) req.personaId = npc.personaId;
    const conv = get().conversationId;
    if (conv) req.conversationId = conv;
    if (extra.choiceId) req.choiceId = extra.choiceId;
    if (extra.playerText) req.playerText = extra.playerText;
    const scene = get()._sceneContext;
    if (scene) req.sceneContext = scene;

    clearWatchdog();
    const timer = setTimeout(() => {
      if (get()._seq !== seq) return;
      const st = get();
      if (st.status === "opening" || (st.status === "streaming" && st.streamText.length === 0)) {
        handleError("They didn't answer. Try again, or leave.");
      }
    }, FIRST_TOKEN_TIMEOUT_MS);
    set({ _firstTokenTimer: timer });

    try {
      for await (const ev of provider.streamTurn(req, ac.signal)) {
        if (get()._seq !== seq || ac.signal.aborted) break;
        switch (ev.t) {
          case "meta":
            clearWatchdog();
            reveal.reset();
            set({
              speaker: ev.speaker,
              mode: ev.mode,
              conversationId: ev.conversationId,
              status: "streaming",
              streamText: "",
            });
            break;
          case "token":
            clearWatchdog();
            reveal.push(ev.delta);
            break;
          case "choices":
            set({ choices: withLeave(ev.choices), status: "awaiting_choice" });
            break;
          case "subtitle":
            get().pushSubtitle({ speaker: ev.speaker, text: ev.text, ttlMs: ev.ttlMs });
            break;
          case "done": {
            commitLine();
            const st = get();
            if (st.mode === "input") {
              set({ status: "awaiting_input" });
            } else if (st.choices.length === 0) {
              set({
                status: "awaiting_choice",
                choices: [{ id: LEAVE_CHOICE_ID, label: "Leave", endsConversation: true }],
              });
            } else {
              set({ status: "awaiting_choice" });
            }
            break;
          }
          case "error":
            handleError(ev.message);
            break;
          default:
            break;
        }
      }
    } catch (err) {
      if (!ac.signal.aborted && get()._seq === seq) {
        handleError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      clearWatchdog();
    }
  };

  return {
    status: "idle",
    conversationId: null,
    speaker: null,
    mode: "choice",
    streamText: "",
    choices: [],
    history: [],
    subtitles: [],
    error: null,
    freeTextEnabled: false,
    nearby: null,

    _abort: null,
    _provider: null,
    _npc: null,
    _sceneContext: null,
    _firstTokenTimer: null,
    _subtitleTimers: new Map<string, ReturnType<typeof setTimeout>>(),
    _seq: 0,

    isOpen: () => get().status !== "idle",
    isBlockingInput: () => get().status !== "idle",
    isRevealComplete: () => reveal.isComplete,

    setNearby: (ref) => set({ nearby: ref }),

    open: (opts) => {
      if (get().status !== "idle") return;
      const npc = { npcId: opts.npcId, personaId: opts.personaId };
      const provider = resolveProvider(npc);
      const ac = new AbortController();
      reveal.reset();

      const preSpeaker: SpeakerMeta | null =
        provider.getSpeaker?.(npc) ??
        (opts.displayName ? { npcId: opts.npcId, displayName: opts.displayName } : null);

      set((s) => ({
        status: "opening",
        conversationId: null,
        speaker: preSpeaker,
        mode: "choice",
        streamText: "",
        choices: [],
        history: [],
        error: null,
        _abort: ac,
        _npc: npc,
        _sceneContext: opts.sceneContext ?? null,
        _provider: provider,
        _seq: s._seq + 1,
      }));

      dialoguePause.enter();
      dialogueEmitter.emit("start", { npcId: opts.npcId });
      void runTurn({});
    },

    pick: (choiceId) => {
      const s = get();
      const choice = s.choices.find((c) => c.id === choiceId);
      if (!choice) return;
      dialogueEmitter.emit("choice", { choiceId, label: choice.label });

      if (choiceId === RETRY_CHOICE_ID) {
        reveal.reset();
        set({ status: "opening", streamText: "", choices: [], error: null });
        void runTurn({});
        return;
      }

      if (choiceId !== LEAVE_CHOICE_ID) {
        const line: HistoryLine = {
          id: uid(),
          speaker: PLAYER_SPEAKER,
          text: choice.label,
          isPlayer: true,
        };
        set((st) => ({ history: capHistory([...st.history, line]) }));
      }

      if (choice.endsConversation) {
        get().close("leave");
        return;
      }

      reveal.reset();
      set({ status: "opening", streamText: "", choices: [], error: null });
      void runTurn({ choiceId });
    },

    sendText: (text) => {
      const parsed = makePlayerTextSchema(MAX_PLAYER_CHARS).safeParse(text);
      if (!parsed.success) return;
      const value = parsed.data;
      const line: HistoryLine = { id: uid(), speaker: PLAYER_SPEAKER, text: value, isPlayer: true };
      reveal.reset();
      set((st) => ({
        history: capHistory([...st.history, line]),
        status: "opening",
        streamText: "",
        choices: [],
        error: null,
      }));
      void runTurn({ playerText: value });
    },

    skipReveal: () => reveal.skip(),

    setFreeTextEnabled: (v) => set({ freeTextEnabled: v }),

    pushSubtitle: (sub) => {
      const id = uid();
      const ttl = sub.ttlMs ?? DEFAULT_SUBTITLE_TTL_MS;
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const entry: ActiveSubtitle = { id, speaker: sub.speaker, text: sub.text, expiresAt: now + ttl };
      set((st) => {
        const next = [...st.subtitles, entry];
        while (next.length > MAX_SUBTITLES) {
          const dropped = next.shift();
          if (dropped) {
            const dt = st._subtitleTimers.get(dropped.id);
            if (dt) {
              clearTimeout(dt);
              st._subtitleTimers.delete(dropped.id);
            }
          }
        }
        return { subtitles: next };
      });
      const timer = setTimeout(() => removeSubtitle(id), ttl);
      get()._subtitleTimers.set(id, timer);
      dialogueEmitter.emit("subtitle", { speaker: sub.speaker, text: sub.text });
    },

    close: (reason) => {
      const s = get();
      if (s.status === "idle") return;
      s._abort?.abort();
      clearWatchdog();
      reveal.reset();
      dialoguePause.exit();
      dialogueEmitter.emit("end", { npcId: s._npc?.npcId, reason: reason ?? "leave" });
      set({
        status: "idle",
        conversationId: null,
        speaker: null,
        mode: "choice",
        streamText: "",
        choices: [],
        history: [],
        error: null,
        _abort: null,
        _provider: null,
        _npc: null,
        _sceneContext: null,
      });
    },
  };
});
