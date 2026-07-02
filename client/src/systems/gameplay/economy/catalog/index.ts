// Catalog loader — merges every storefront, validates once at boot with zod, and exposes
// O(1) lookups. Static data: parsed a single time, never per purchase.
import { z } from "zod";
import type { BusinessItem, CatalogItem, ShopKind } from "../types";
import { WEAPONS } from "./weapons";
import { VEHICLES } from "./vehicles";
import { CLOTHING } from "./clothing";
import { BUSINESSES } from "./businesses";

const requirementSchema = z.object({
  skill: z.enum([
    "shooting",
    "strength",
    "stealth",
    "driving",
    "stamina",
    "lung",
    "flying",
    "hacking",
    "charisma",
  ]),
  level: z.number().int().min(0).max(100),
});

const itemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  price: z.number().int().nonnegative(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  shop: z.enum(["weapons", "vehicles", "clothing", "business"]),
  blurb: z.string().optional(),
  requires: requirementSchema.optional(),
  incomePerMin: z.number().nonnegative().optional(),
  launderPerMin: z.number().nonnegative().optional(),
});

/** Validate an authored array; on failure, warn (dev) and fall back to the raw data. */
function validate<T extends CatalogItem>(items: T[], label: string): T[] {
  const parsed = z.array(itemSchema).safeParse(items);
  if (!parsed.success) {
    console.warn(`[economy] catalog "${label}" failed validation`, parsed.error.flatten());
  }
  return items;
}

export const CATALOG: CatalogItem[] = [
  ...validate(WEAPONS, "weapons"),
  ...validate(VEHICLES, "vehicles"),
  ...validate(CLOTHING, "clothing"),
  ...validate(BUSINESSES, "businesses"),
];

const BY_ID: ReadonlyMap<string, CatalogItem> = new Map(
  CATALOG.map((i): [string, CatalogItem] => [i.id, i]),
);

/** Look up any catalog item by id. */
export const getCatalogItem = (id: string): CatalogItem | undefined => BY_ID.get(id);

/** All items in one storefront, cheapest first. */
export const catalogByShop = (shop: ShopKind): CatalogItem[] =>
  CATALOG.filter((i) => i.shop === shop).sort((a, b) => a.tier - b.tier || a.price - b.price);

/** Type guard: is this item an income-producing business front? */
export const isBusiness = (item: CatalogItem | undefined): item is BusinessItem =>
  !!item && item.shop === "business";

/** Passive clean income per minute for a set of owned asset ids. */
export const incomePerMinFor = (ids: Iterable<string>): number => {
  let total = 0;
  for (const id of ids) {
    const item = getCatalogItem(id);
    if (isBusiness(item)) total += item.incomePerMin;
  }
  return total;
};

/** Extra dirty→clean laundering capacity per minute for a set of owned asset ids. */
export const launderCapacityFor = (ids: Iterable<string>): number => {
  let total = 0;
  for (const id of ids) {
    const item = getCatalogItem(id);
    if (isBusiness(item)) total += item.launderPerMin ?? 0;
  }
  return total;
};

export { WEAPONS, VEHICLES, CLOTHING, BUSINESSES };
