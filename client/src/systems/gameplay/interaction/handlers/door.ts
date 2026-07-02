// Built-in `door` handler. Toggles an open/closed flag stored on the interactable's own data
// payload (serializable), so the owning content can animate off `interact_.data.open` or the
// `door` event. The prompt verb reflects the current state.

import type { InteractionHandler, PromptData } from "../types";
import { PRIMARY_KEY_GLYPH } from "../constants";

export interface DoorData {
  open?: boolean;
  /** Verb shown while closed (defaults to config.verb or "Open"). */
  openVerb?: string;
  /** Verb shown while open (defaults to "Close"). */
  closeVerb?: string;
}

export const doorHandler: InteractionHandler = {
  kind: "door",
  defaultRange: 2.2,

  getPrompt(ctx): PromptData | null {
    const data = (ctx.config.data ?? {}) as DoorData;
    const open = !!data.open;
    const verb = open ? (data.closeVerb ?? "Close") : (data.openVerb ?? ctx.config.verb ?? "Open");
    return { key: ctx.config.key ?? PRIMARY_KEY_GLYPH, verb, label: ctx.config.label };
  },

  onInteract(ctx): void {
    const cfg = ctx.config;
    const data = (cfg.data ?? (cfg.data = {})) as DoorData;
    data.open = !data.open;
    ctx.events.emit("door", { entity: ctx.entity, open: !!data.open });
  },
};
