// Built-in `shop_buy` handler (v3 scaffold). Emits `shop_buy`; the Economy subsystem subscribes
// (or overrides) to run the real purchase. When Economy owns this kind it can return `null` from
// `getPrompt` to hide the action when the player can't afford it.

import type { InteractionHandler, PromptData } from "../types";
import { PRIMARY_KEY_GLYPH } from "../constants";

export interface ShopBuyData {
  sku?: string;
  price?: number;
  /** Display name fallback for the prompt label. */
  name?: string;
}

export const shopBuyHandler: InteractionHandler = {
  kind: "shop_buy",
  defaultRange: 2.6,

  getPrompt(ctx): PromptData | null {
    const data = (ctx.config.data ?? {}) as ShopBuyData;
    const label =
      ctx.config.label ?? data.name ?? (data.price != null ? `$${data.price}` : undefined);
    return { key: ctx.config.key ?? PRIMARY_KEY_GLYPH, verb: ctx.config.verb || "Buy", label };
  },

  onInteract(ctx): void {
    const data = (ctx.config.data ?? {}) as ShopBuyData;
    ctx.events.emit("shop_buy", { entity: ctx.entity, sku: data.sku, price: data.price });
  },
};
