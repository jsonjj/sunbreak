// Built-in `item_pickup` handler. Emits `item_pickup` (for the Inventory subsystem to grant the
// item) and then despawns the world entity — the interaction subsystem owns removal of the picked
// world object, per spec.

import type { InteractionHandler, PromptData } from "../types";
import { PRIMARY_KEY_GLYPH } from "../constants";

export interface ItemPickupData {
  itemId?: string;
  qty?: number;
  /** Display name fallback for the prompt label. */
  name?: string;
}

export const itemPickupHandler: InteractionHandler = {
  kind: "item_pickup",
  defaultRange: 1.8,

  getPrompt(ctx): PromptData | null {
    const data = (ctx.config.data ?? {}) as ItemPickupData;
    return {
      key: ctx.config.key ?? PRIMARY_KEY_GLYPH,
      verb: ctx.config.verb || "Pick up",
      label: ctx.config.label ?? data.name,
      hold: ctx.config.hold,
    };
  },

  onInteract(ctx): void {
    const data = (ctx.config.data ?? {}) as ItemPickupData;
    ctx.events.emit("item_pickup", {
      entity: ctx.entity,
      itemId: data.itemId,
      qty: data.qty ?? 1,
    });
    ctx.world.remove(ctx.entity);
  },
};
