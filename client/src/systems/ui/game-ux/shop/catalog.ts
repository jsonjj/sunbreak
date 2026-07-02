// Shop catalog types + seed data. The spec locates these types in `shared/economy/catalog.ts`;
// this wave can't edit `shared`, so they live here and are exported for the integrator to move /
// re-export from shared later. Vendors are data-driven — add a ShopCatalog and it "just works".
import type { UxCurrency } from "../state/bus";
import type { Grants } from "../state/economyAdapter";
import type { IconName } from "../kit/Icon";

export interface ShopItem {
  id: string;
  name: string;
  desc: string;
  price: number;
  currency: UxCurrency;
  category: string;
  icon?: IconName;
  grants?: Grants;
  /** can be sold back (v1 sell path); resale is a fraction of price. */
  sellable?: boolean;
  /** requirement label; when set the row is shown locked (rep/skill gate, v3). */
  lockedReason?: string;
  tag?: string;
}

export interface ShopCatalog {
  vendorId: string;
  name: string;
  tagline: string;
  accent?: string;
  /** fraction of price returned on sell. */
  resale?: number;
  items: ShopItem[];
}

const IRONWORKS: ShopCatalog = {
  vendorId: "ironworks",
  name: "Ironworks Supply",
  tagline: "Verano's honest hardware. Ask no questions.",
  accent: "var(--ux-accent)",
  resale: 0.5,
  items: [
    { id: "iw_pistol", name: "Sidearm", desc: "Reliable 9mm. Every strip runner's first friend.", price: 450, currency: "clean", category: "Sidearms", icon: "target", grants: { items: ["weapon:pistol"] }, sellable: true, tag: "Starter" },
    { id: "iw_smg", name: "Compact SMG", desc: "High fire-rate, low patience.", price: 1650, currency: "clean", category: "Automatic", icon: "target", grants: { items: ["weapon:smg"] }, sellable: true },
    { id: "iw_shotgun", name: "Breacher", desc: "Doors, and the people behind them.", price: 2200, currency: "clean", category: "Heavy", icon: "target", grants: { items: ["weapon:shotgun"] }, sellable: true },
    { id: "iw_armor", name: "Body Armor", desc: "+50 armor. Buys you seconds — spend them well.", price: 600, currency: "clean", category: "Gear", icon: "shield", grants: { items: ["armor:50"] } },
    { id: "iw_medkit", name: "Field Medkit", desc: "Full heal in the field. Cami-approved.", price: 250, currency: "clean", category: "Gear", icon: "heart", grants: { items: ["heal:full"] } },
    { id: "iw_rifle", name: "Marksman Rifle", desc: "Reach out. Requires standing.", price: 5400, currency: "clean", category: "Heavy", icon: "target", lockedReason: "Rep 3 required" },
  ],
};

const THREADCOUNT: ShopCatalog = {
  vendorId: "threadcount",
  name: "Threadcount",
  tagline: "Look the part before you play it.",
  accent: "var(--ux-accent-rose)",
  resale: 0.4,
  items: [
    { id: "tc_jacket", name: "Verano Jacket", desc: "Sun-bleached and unbothered.", price: 320, currency: "clean", category: "Tops", icon: "bag", grants: { items: ["wear:jacket"] }, sellable: true },
    { id: "tc_kicks", name: "Street Kicks", desc: "Quiet soles for loud nights.", price: 210, currency: "clean", category: "Shoes", icon: "bag", grants: { items: ["wear:kicks"] }, sellable: true },
    { id: "tc_shades", name: "Sunbreak Shades", desc: "Golden-hour, all hours.", price: 140, currency: "clean", category: "Accessories", icon: "star", grants: { items: ["wear:shades"] }, sellable: true },
    { id: "tc_chain", name: "Bag Chain", desc: "Statement piece. The statement is money.", price: 900, currency: "dirty", category: "Accessories", icon: "cash", grants: { items: ["wear:chain"] }, sellable: true, tag: "Dirty cash" },
  ],
};

const CATALOGS: Record<string, ShopCatalog> = {
  [IRONWORKS.vendorId]: IRONWORKS,
  [THREADCOUNT.vendorId]: THREADCOUNT,
};

export const shopVendorIds = Object.keys(CATALOGS);

/** Look up a vendor catalog; falls back to the first seed so an unknown id still opens. */
export function getCatalog(vendorId: string | null | undefined): ShopCatalog {
  return (vendorId && CATALOGS[vendorId]) || IRONWORKS;
}

/** Register/override a catalog at runtime (integrator: feed the real economy vendors here). */
export function registerCatalog(catalog: ShopCatalog): void {
  CATALOGS[catalog.vendorId] = catalog;
}
