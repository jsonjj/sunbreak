// Imperative façade + observer API. Missions/Narrative drive conversations through
// `start/end/pick/sendText`; Audio/HUD/Missions observe via `onLine/onChoice/onEnd`.
// This is the stable surface other subsystems consume (with the shared contract);
// the store internals stay private.

import { useDialogueStore, type StartOptions } from "./store";
import {
  dialogueEmitter,
  type DialogueChoiceEvent,
  type DialogueEndEvent,
  type DialogueLineEvent,
  type DialogueStartEvent,
  type DialogueSubtitleEvent,
} from "./events";
import type { SpeakerMeta } from "./contract";

type Unsubscribe = () => void;

export const DialogueController = {
  /** Begin a conversation (proximity flow, a mission beat, or a scripted trigger). */
  start(opts: StartOptions): void {
    useDialogueStore.getState().open(opts);
  },
  /** End the active conversation (restores the sim). */
  end(): void {
    useDialogueStore.getState().close("api");
  },
  /** Select a choice by id (as if the player clicked it). */
  pick(choiceId: string): void {
    useDialogueStore.getState().pick(choiceId);
  },
  /** Submit a free-text turn (input mode). */
  sendText(text: string): void {
    useDialogueStore.getState().sendText(text);
  },
  /** Push a transient ambient bark subtitle (peds/world → the subtitle channel). */
  pushSubtitle(sub: { speaker: SpeakerMeta; text: string; ttlMs?: number }): void {
    useDialogueStore.getState().pushSubtitle(sub);
  },
  /** Is a conversation currently open? */
  isOpen(): boolean {
    return useDialogueStore.getState().isOpen();
  },

  // ── observers (return an unsubscribe) ──────────────────────────────────────
  onStart(fn: (e: DialogueStartEvent) => void): Unsubscribe {
    dialogueEmitter.on("start", fn);
    return () => dialogueEmitter.off("start", fn);
  },
  onLine(fn: (e: DialogueLineEvent) => void): Unsubscribe {
    dialogueEmitter.on("line", fn);
    return () => dialogueEmitter.off("line", fn);
  },
  onChoice(fn: (e: DialogueChoiceEvent) => void): Unsubscribe {
    dialogueEmitter.on("choice", fn);
    return () => dialogueEmitter.off("choice", fn);
  },
  onSubtitle(fn: (e: DialogueSubtitleEvent) => void): Unsubscribe {
    dialogueEmitter.on("subtitle", fn);
    return () => dialogueEmitter.off("subtitle", fn);
  },
  onEnd(fn: (e: DialogueEndEvent) => void): Unsubscribe {
    dialogueEmitter.on("end", fn);
    return () => dialogueEmitter.off("end", fn);
  },
};

export type DialogueControllerApi = typeof DialogueController;
