// Clothing storefront — pure cosmetics; one charisma-gated luxury piece for flavor.
import type { CatalogItem } from "../types";

export const CLOTHING: CatalogItem[] = [
  { id: "clo_tee", name: "Verano Tee", price: 80, tier: 1, shop: "clothing", blurb: "Local classic." },
  { id: "clo_shades", name: "Sunbreak Shades", price: 220, tier: 1, shop: "clothing", blurb: "Golden-hour ready." },
  { id: "clo_jacket", name: "Coast Runner Jacket", price: 950, tier: 2, shop: "clothing", blurb: "Sea-breeze proof." },
  { id: "clo_sneakers", name: "Boardwalk Kicks", price: 1400, tier: 2, shop: "clothing", blurb: "Silent on tile." },
  { id: "clo_watch", name: "Dusk Chrono", price: 8000, tier: 4, shop: "clothing", blurb: "Time, flexed." },
  {
    id: "clo_suit",
    name: "Marina Linen Suit",
    price: 26000,
    tier: 5,
    shop: "clothing",
    blurb: "Opens velvet ropes.",
    requires: { skill: "charisma", level: 50 },
  },
];
