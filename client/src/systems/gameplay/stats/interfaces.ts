// Thin, injectable interfaces to sibling subsystems that may not exist yet. Defaults are
// no-ops so death/respawn works standalone; economy + wanted inject the real impls when they
// load (via `setEconomyBridge` / `setPoliceBridge`, re-exported from index).

import type { EconomyBridge, PoliceBridge } from "./types";

const noopEconomy: EconomyBridge = { charge: () => true };
const noopPolice: PoliceBridge = { clearWanted: () => {} };

let economy: EconomyBridge = noopEconomy;
let police: PoliceBridge = noopPolice;

export function setEconomyBridge(bridge: EconomyBridge | null): void {
  economy = bridge ?? noopEconomy;
}

export function setPoliceBridge(bridge: PoliceBridge | null): void {
  police = bridge ?? noopPolice;
}

export function getEconomy(): EconomyBridge {
  return economy;
}

export function getPolice(): PoliceBridge {
  return police;
}
