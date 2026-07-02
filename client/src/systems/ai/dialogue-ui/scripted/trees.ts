// v1 scripted dialogue trees — deterministic, authored, FREE, and fully offline. This
// is canon's "every phase must run with no API key" guarantee: the entire UI (choices,
// subtitles, soft-pause, streaming reveal) exercises with zero OpenAI. The scripted
// engine implements the SAME `DialogueProvider` contract as the live brain, so the
// store/overlay are source-agnostic.

import {
  type DialogueChoice,
  type DialogueEvent,
  type DialogueProvider,
  type DialogueTurnRequest,
  type SpeakerMeta,
} from "../contract";

interface ScriptedChoice {
  id: string;
  label: string;
  hint?: string;
  next?: string;
  endsConversation?: boolean;
}
interface ScriptedNode {
  text: string;
  emotion?: string;
  choices?: ScriptedChoice[];
}
interface ScriptedTree {
  speaker: SpeakerMeta;
  start: string;
  nodes: Record<string, ScriptedNode>;
}

// ── Authored trees ─────────────────────────────────────────────────────────────

const SPARKS: ScriptedTree = {
  speaker: { npcId: "sparks", displayName: "Sparks", color: "#ff8a4c", emotion: "wry" },
  start: "root",
  nodes: {
    root: {
      text: "Well, look who washed up at the marina. You after work, or just here for the view?",
      emotion: "wry",
      choices: [
        { id: "work", label: "I need a boat looked at.", next: "work" },
        { id: "view", label: "Just the view.", next: "view" },
        { id: "rumor", label: "Heard anything worth knowing?", next: "rumor" },
      ],
    },
    work: {
      text: "Bring it round to the far slip after sundown. I'll have the tools out — and my prices honest, mostly.",
      emotion: "warm",
      choices: [
        { id: "thanks", label: "Appreciated.", next: "root" },
        { id: "bye", label: "Later, Sparks.", endsConversation: true },
      ],
    },
    view: {
      text: "Best light in Santa Vista, that dusk gold. Costs nothing, which is why I can afford it.",
      emotion: "calm",
      choices: [
        { id: "back", label: "Actually — about that work…", next: "work" },
        { id: "bye", label: "Enjoy it.", endsConversation: true },
      ],
    },
    rumor: {
      text: "Word is the harbor cameras go blind for ten minutes at low tide. Not that I'd know what you'd do with that.",
      emotion: "sly",
      choices: [
        { id: "more", label: "Go on.", next: "rumor2" },
        { id: "bye", label: "Good to know.", endsConversation: true },
      ],
    },
    rumor2: {
      text: "That's the whole tune. Ask me again when you've got something to trade.",
      emotion: "wry",
      choices: [{ id: "bye", label: "Fair enough.", endsConversation: true }],
    },
  },
};

const LOCAL: ScriptedTree = {
  speaker: { npcId: "local", displayName: "Local", color: "#ffd166", emotion: "neutral" },
  start: "root",
  nodes: {
    root: {
      text: "Hey. Wild day for it, huh?",
      choices: [
        { id: "agree", label: "Sure is.", next: "agree" },
        { id: "dir", label: "Which way to the boardwalk?", next: "dir" },
        { id: "bye", label: "Take care.", endsConversation: true },
      ],
    },
    agree: {
      text: "Sun's out, everyone's out. Just watch the traffic on the strip.",
      choices: [{ id: "bye", label: "Will do.", endsConversation: true }],
    },
    dir: {
      text: "Two blocks toward the water, then follow the palms. You can't miss the lights.",
      choices: [{ id: "bye", label: "Thanks.", endsConversation: true }],
    },
  },
};

/** personaId → tree. Ped archetypes fall back to LOCAL via `archetype:*`. */
const TREES: Record<string, ScriptedTree> = {
  sparks: SPARKS,
  local: LOCAL,
};

// ── Resolution ──────────────────────────────────────────────────────────────────

function resolveTree(ref: { npcId: string; personaId?: string }): ScriptedTree | undefined {
  const persona = ref.personaId;
  if (persona) {
    if (TREES[persona]) return TREES[persona];
    // Generic peds carry `archetype:<kind>` → everyone can be chatted with, offline.
    if (persona.startsWith("archetype:")) return LOCAL;
  }
  return TREES[ref.npcId];
}

/** Whether we can serve this ref entirely from authored content (free / offline). */
export function hasScriptedTree(ref: { npcId: string; personaId?: string }): boolean {
  return resolveTree(ref) !== undefined;
}

// ── Session state (per conversationId) ───────────────────────────────────────────

interface Session {
  nodeId: string;
}
const sessions = new Map<string, Session>();
let convSeq = 0;
const mintId = (): string => `scr_${(convSeq++).toString(36)}_${Date.now().toString(36)}`;

function nextNodeId(tree: ScriptedTree, currentId: string, choiceId?: string): string {
  const current = tree.nodes[currentId];
  if (!choiceId) return currentId; // retry / re-show
  const choice = current?.choices?.find((c) => c.id === choiceId);
  return choice?.next ?? currentId;
}

const toWireChoices = (node: ScriptedNode): DialogueChoice[] =>
  (node.choices ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    hint: c.hint,
    endsConversation: c.endsConversation,
  }));

/** Split a line into small chunks so the reveal path is exercised like a live stream. */
function* chunk(text: string): Generator<string> {
  const parts = text.split(/(\s+)/); // keep whitespace as its own token
  for (const p of parts) if (p) yield p;
}

async function* scriptedStream(
  req: DialogueTurnRequest,
  signal: AbortSignal,
): AsyncGenerator<DialogueEvent> {
  const tree = resolveTree(req);
  if (!tree) {
    yield { t: "error", message: "No one to talk to.", recoverable: false };
    return;
  }

  const conversationId = req.conversationId ?? mintId();
  const prev = req.conversationId ? sessions.get(req.conversationId) : undefined;
  const nodeId = prev ? nextNodeId(tree, prev.nodeId, req.choiceId) : tree.start;
  const node = tree.nodes[nodeId] ?? tree.nodes[tree.start];
  sessions.set(conversationId, { nodeId });

  if (!node) {
    yield { t: "error", message: "The conversation trailed off.", recoverable: true };
    return;
  }

  const speaker: SpeakerMeta = { ...tree.speaker, emotion: node.emotion ?? tree.speaker.emotion };
  yield { t: "meta", conversationId, speaker, mode: "choice" };

  for (const piece of chunk(node.text)) {
    if (signal.aborted) return;
    yield { t: "token", delta: piece };
  }

  const choices = toWireChoices(node);
  if (choices.length) yield { t: "choices", choices };
  yield { t: "done", conversationId };
}

export const scriptedProvider: DialogueProvider = {
  id: "scripted",
  streamTurn: scriptedStream,
  getSpeaker(ref) {
    return resolveTree(ref)?.speaker;
  },
};
