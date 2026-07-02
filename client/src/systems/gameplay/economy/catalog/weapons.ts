// Weapon storefront — clean-cash purchases, higher tiers gated by Shooting milestones.
import type { CatalogItem } from "../types";

export const WEAPONS: CatalogItem[] = [
  { id: "wpn_bat", name: "Boardwalk Bat", price: 150, tier: 1, shop: "weapons", blurb: "Reliable persuasion." },
  { id: "wpn_pistol", name: "Verano 9", price: 900, tier: 1, shop: "weapons", blurb: "Everyday sidearm." },
  {
    id: "wpn_smg",
    name: "Tide SMG",
    price: 3200,
    tier: 2,
    shop: "weapons",
    blurb: "Spray the boulevard.",
    requires: { skill: "shooting", level: 25 },
  },
  {
    id: "wpn_shotgun",
    name: "Dockside 12g",
    price: 4800,
    tier: 3,
    shop: "weapons",
    blurb: "Close-range authority.",
    requires: { skill: "shooting", level: 25 },
  },
  {
    id: "wpn_rifle",
    name: "Sunset Carbine",
    price: 9500,
    tier: 4,
    shop: "weapons",
    blurb: "Ranged control.",
    requires: { skill: "shooting", level: 50 },
  },
  {
    id: "wpn_marksman",
    name: "Horizon Marksman",
    price: 22000,
    tier: 5,
    shop: "weapons",
    blurb: "One breath, one shot.",
    requires: { skill: "shooting", level: 75 },
  },
];
