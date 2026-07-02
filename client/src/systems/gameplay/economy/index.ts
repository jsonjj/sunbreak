// Subsystem: gameplay/economy (client) — wallets, shops, skills/progression, local save.
// Self-registers on import (WAVE-2 §b). Also the public barrel other subsystems import from:
//   import { economyApi, useEconomy, EconomyUI } from "@/systems/gameplay/economy";
import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";

// ECS augmentation (declaration-merges econ_* into SimComponents).
import "./economy.components";

import { pickupSystem } from "./systems/pickupSystem";
import { walletSyncSystem } from "./systems/walletSyncSystem";
import { startIncomeLoop } from "./systems/incomeLoop";

type W = typeof world;

export const mod: SubsystemModule<W> = {
  id: "gameplay/economy",
  systems: [pickupSystem, walletSyncSystem],
  init() {
    // Passive-income wall-clock loop (off the frame loop). Returns cleanup.
    return startIncomeLoop();
  },
};

registerModule(mod); // required side effect

// ── Public API ─────────────────────────────────────────────────────────────────
// Imperative facade for missions / activities / combat / vehicles / world (no React):
export { economyApi } from "./api";
export type { EconomyApi } from "./api";

// The store + React selector hooks for HUD / menus:
export { useEconomy } from "./store/economyStore";
export type { EconomyState } from "./store/economyStore";
export * from "./hooks";

// Data contracts (Money, Wallet, Skills, CatalogItem, EconomySave, …):
export * from "./types";

// Catalog + lookups:
export {
  CATALOG,
  getCatalogItem,
  catalogByShop,
  isBusiness,
  incomePerMinFor,
  launderCapacityFor,
  WEAPONS,
  VEHICLES,
  CLOTHING,
  BUSINESSES,
} from "./catalog";

// Pure rules namespace (reusable by the v4 server validator):
export * as economyRules from "./rules";

// Mountable UI (integrator adds <EconomyUI/> as a DOM sibling of <HUD/>):
export { EconomyUI } from "./ui/EconomyUI";
export { money, moneyShort } from "./ui/format";
