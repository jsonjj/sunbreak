// Vehicle storefront — from beaters to hypercars; top tiers gated by Driving skill.
import type { CatalogItem } from "../types";

export const VEHICLES: CatalogItem[] = [
  { id: "veh_scooter", name: "Palm Scooter", price: 1200, tier: 1, shop: "vehicles", blurb: "Beat the traffic." },
  { id: "veh_sedan", name: "Verano Sedan", price: 6500, tier: 1, shop: "vehicles", blurb: "Honest four-door." },
  { id: "veh_suv", name: "Dune SUV", price: 14000, tier: 2, shop: "vehicles", blurb: "Curb-proof." },
  {
    id: "veh_coupe",
    name: "Boulevard Coupe",
    price: 28000,
    tier: 3,
    shop: "vehicles",
    blurb: "Turn heads at dusk.",
    requires: { skill: "driving", level: 25 },
  },
  {
    id: "veh_sports",
    name: "Riptide GT",
    price: 72000,
    tier: 4,
    shop: "vehicles",
    blurb: "Coastline destroyer.",
    requires: { skill: "driving", level: 50 },
  },
  {
    id: "veh_hyper",
    name: "Solstice Hyper",
    price: 240000,
    tier: 5,
    shop: "vehicles",
    blurb: "Physics, negotiated.",
    requires: { skill: "driving", level: 75 },
  },
];
