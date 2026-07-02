// Built-in `npc_talk` handler (v3 scaffold). For now it just emits `npc_talk`; the Dialogue UI /
// server OpenAI proxy subsystem subscribes (or overrides this handler) to open a conversation.

import type { InteractionHandler, PromptData } from "../types";
import { PRIMARY_KEY_GLYPH } from "../constants";

export interface NpcTalkData {
  npcId?: string;
  /** Display name fallback for the prompt label. */
  name?: string;
}

export const npcTalkHandler: InteractionHandler = {
  kind: "npc_talk",
  defaultRange: 2.6,

  getPrompt(ctx): PromptData | null {
    const data = (ctx.config.data ?? {}) as NpcTalkData;
    return {
      key: ctx.config.key ?? PRIMARY_KEY_GLYPH,
      verb: ctx.config.verb || "Talk",
      label: ctx.config.label ?? data.name,
    };
  },

  onInteract(ctx): void {
    const data = (ctx.config.data ?? {}) as NpcTalkData;
    ctx.events.emit("npc_talk", { entity: ctx.entity, npcId: data.npcId });
  },
};
