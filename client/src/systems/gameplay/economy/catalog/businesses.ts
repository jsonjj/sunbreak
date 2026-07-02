// Business fronts — durable assets that accrue passive clean income (wall-clock) and, for
// some, add dirty→clean laundering capacity. Bought via the shop API, tracked in `owned`.
import type { BusinessItem } from "../types";

export const BUSINESSES: BusinessItem[] = [
  {
    id: "biz_chopshop",
    name: "Backlot Chop Shop",
    price: 45000,
    tier: 2,
    shop: "business",
    blurb: "Cars in, cash out.",
    incomePerMin: 60,
    launderPerMin: 40,
  },
  {
    id: "biz_dispensary",
    name: "Verano Dispensary",
    price: 90000,
    tier: 3,
    shop: "business",
    blurb: "Legit-ish storefront.",
    incomePerMin: 130,
    launderPerMin: 120,
  },
  {
    id: "biz_clouthouse",
    name: "CloutHouse Studio",
    price: 160000,
    tier: 4,
    shop: "business",
    blurb: "Influence, monetized.",
    incomePerMin: 240,
    requires: { skill: "charisma", level: 50 },
  },
  {
    id: "biz_neontide",
    name: "Neon Tide Club",
    price: 320000,
    tier: 5,
    shop: "business",
    blurb: "The city never sleeps.",
    incomePerMin: 520,
    launderPerMin: 300,
    requires: { skill: "charisma", level: 25 },
  },
];
