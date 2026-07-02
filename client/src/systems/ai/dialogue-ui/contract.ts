// ─────────────────────────────────────────────────────────────────────────────
// DIALOGUE — CROSS-SUBSYSTEM CONTRACT
// client/src/systems/ai/dialogue-ui/contract.ts
// ─────────────────────────────────────────────────────────────────────────────
// The wire + runtime contract for in-game conversation:
//   • the streaming `DialogueEvent` union (one JSON object per SSE `data:` frame),
//   • the `DialogueTurnRequest` the UI posts each turn,
//   • the `SpeakerMeta` / `DialogueChoice` render shapes,
//   • the `Conversable` ECS payload a ped/NPC carries so we can talk to it,
//   • a *runtime* provider registry that decouples this UI from the npc-personas
//     subsystem (no folder import between subsystems).
//
// WHY THIS LIVES HERE (and not in @sunbreak/shared):
//   Wave-2 forbids editing `shared/**`. This file is a faithful mirror of the
//   intended `shared/src/dialogue/protocol.ts` and is dialogue-agnostic — the
//   integrator can hoist it into @sunbreak/shared verbatim. Sibling subsystems
//   (npc-personas client, the server dialogue route) MUST NOT import this file by
//   path; they agree on the *shape* and wire at runtime via
//   `registerDialogueProvider` / `getDialogueProvider` (a globalThis singleton
//   keyed by a stable Symbol) so there is zero code coupling across folders.

import { z } from "zod";

// ── Wire schemas (zod is the single source of truth; TS types are inferred) ─────

export const dialogueModeSchema = z.enum(["choice", "input"]);
/** How the player answers this turn: pick a `choice`, or type free `input`. */
export type DialogueMode = z.infer<typeof dialogueModeSchema>;

export const dialogueChoiceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  hint: z.string().optional(),
  endsConversation: z.boolean().optional(),
});
export type DialogueChoice = z.infer<typeof dialogueChoiceSchema>;

export const speakerMetaSchema = z.object({
  npcId: z.string().min(1),
  displayName: z.string().min(1),
  /** CSS color for the nameplate accent (hex/rgb). */
  color: z.string().optional(),
  /** Free-form emotion tag (e.g. "calm", "angry") for tinting / portraits / TTS. */
  emotion: z.string().optional(),
});
export type SpeakerMeta = z.infer<typeof speakerMetaSchema>;

export const dialogueTurnRequestSchema = z.object({
  /** Omitted on the first turn → the server (or scripted engine) mints one. */
  conversationId: z.string().optional(),
  npcId: z.string().min(1),
  personaId: z.string().optional(),
  /** Free-text turn (input mode). */
  playerText: z.string().optional(),
  /** Selected choice id (choice mode). */
  choiceId: z.string().optional(),
  /** location, time-of-day, wanted level, story flags, … (owned by the caller). */
  sceneContext: z.record(z.string(), z.unknown()).optional(),
});
export type DialogueTurnRequest = z.infer<typeof dialogueTurnRequestSchema>;

/** One JSON object per SSE `data:` frame; `data: [DONE]` terminates the stream. */
export const dialogueEventSchema = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("meta"),
    conversationId: z.string(),
    speaker: speakerMetaSchema,
    mode: dialogueModeSchema,
  }),
  z.object({ t: z.literal("token"), delta: z.string() }),
  z.object({ t: z.literal("choices"), choices: z.array(dialogueChoiceSchema) }),
  z.object({
    t: z.literal("subtitle"),
    speaker: speakerMetaSchema,
    text: z.string(),
    ttlMs: z.number().optional(),
  }),
  z.object({ t: z.literal("done"), conversationId: z.string() }),
  z.object({ t: z.literal("error"), message: z.string(), recoverable: z.boolean().optional() }),
]);
export type DialogueEvent = z.infer<typeof dialogueEventSchema>;

/** Length-bounded, trimmed free-text schema (validate at the edge before sending). */
export const makePlayerTextSchema = (max: number) => z.string().trim().min(1).max(max);

// ── ECS payload: what a talk-able entity carries (attached by peds/NPC subsystems) ─

/**
 * Component data marking an entity as talk-able. We define the SHAPE; the ped /
 * npc-personas subsystems ATTACH it (as the `dlg_conversable` ECS component — see
 * `components.ts`). Any entity with this + a `transform` is a valid talk target.
 */
export interface Conversable {
  npcId: string;
  displayName: string;
  personaId?: string;
  /** Nameplate accent color. */
  color?: string;
  /** Faction/relationship hint (drives tone; opaque to this UI). */
  faction?: string;
}

// ── Runtime provider seam (decoupled npc-personas / OpenAI-service consumption) ──

/**
 * The "dialogue brain": produces a stream of `DialogueEvent`s for a turn. Implemented
 * by (a) the npc-personas client API, (b) our default HTTP/SSE client, and (c) the
 * scripted-tree engine. Register the live one at runtime — never import it by path.
 */
export interface DialogueProvider {
  readonly id?: string;
  streamTurn(req: DialogueTurnRequest, signal: AbortSignal): AsyncIterable<DialogueEvent>;
  /** Optional synchronous speaker lookup used for the nameplate before the first frame. */
  getSpeaker?(ref: { npcId: string; personaId?: string }): SpeakerMeta | undefined;
}

/** Stable cross-realm key so any subsystem can (un)register without importing this file. */
const PROVIDER_KEY = Symbol.for("sunbreak.dialogue.provider.v1");

const symbolBag = (): Record<symbol, unknown> =>
  globalThis as unknown as Record<symbol, unknown>;

/**
 * Register (or clear) the live dialogue provider — called by the npc-personas client
 * subsystem, e.g. `registerDialogueProvider(npcPersonas.dialogueProvider)`.
 * Equivalent, folder-free form: `globalThis[Symbol.for("sunbreak.dialogue.provider.v1")] = provider`.
 */
export function registerDialogueProvider(provider: DialogueProvider | null): void {
  symbolBag()[PROVIDER_KEY] = provider ?? undefined;
}

/** The currently-registered live provider, if any. */
export function getDialogueProvider(): DialogueProvider | undefined {
  return symbolBag()[PROVIDER_KEY] as DialogueProvider | undefined;
}
