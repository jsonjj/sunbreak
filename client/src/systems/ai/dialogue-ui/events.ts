// A tiny typed event bus (mitt) so Missions/Narrative, Audio and HUD can OBSERVE
// conversations without touching the store internals. The store emits; the
// DialogueController re-exports subscription helpers.

import mitt from "mitt";
import type { Emitter } from "mitt";
import type { SpeakerMeta } from "./contract";

export type DialogueEndReason = "leave" | "api" | "aborted" | "error" | "out_of_range";

export interface DialogueStartEvent {
  npcId: string;
  conversationId?: string;
}
export interface DialogueLineEvent {
  speaker: SpeakerMeta;
  text: string;
  emotion?: string;
}
export interface DialogueChoiceEvent {
  choiceId: string;
  label: string;
}
export interface DialogueSubtitleEvent {
  speaker: SpeakerMeta;
  text: string;
}
export interface DialogueEndEvent {
  npcId?: string;
  reason: DialogueEndReason;
}

/** mitt requires an event map of `Record<string, unknown>`-compatible payloads. */
export type DialogueEmitterEvents = {
  start: DialogueStartEvent;
  line: DialogueLineEvent;
  choice: DialogueChoiceEvent;
  subtitle: DialogueSubtitleEvent;
  end: DialogueEndEvent;
};

export const dialogueEmitter: Emitter<DialogueEmitterEvents> = mitt<DialogueEmitterEvents>();
