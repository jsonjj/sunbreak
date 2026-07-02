// Economy adapter — how mission rewards become money/weapons.
//
// Resolution order (per the WAVE-2 "stub adapter" pattern, since the economy subsystem is a
// sibling that may not be loaded yet):
//   1. A registered `econ_` money API (the economy subsystem wires this to `useEconomy.grantPayout`).
//   2. Fallback: credit the player's `econ_wallet` ECS component (the shared `econ_` money
//      component) AND mirror onto the HUD `cash` readout so the payout is immediately visible.
// `giveWeapon` sets the shared `weapon` component on the player (real, visible effect) unless
// an inventory API overrides it.

import { world } from "@/ecs/world";
import { WeaponId } from "@sunbreak/shared";
import { useHudStore } from "@/stores/hud.store";
import type { EconomyCtx } from "../types";

let external: Partial<EconomyCtx> | null = null;

/** The economy/inventory subsystem calls this to route mission rewards through its own wallet. */
export function registerMissionEconomy(api: Partial<EconomyCtx>): () => void {
  external = api;
  return () => {
    if (external === api) external = null;
  };
}

const players = world.with("isPlayer");

/** Offline fallback only: credit the shared `econ_wallet.clean` balance IF the economy subsystem
 *  installed a wallet on the player. The economy subsystem OWNS `econ_wallet` and its
 *  `{char,clean,dirty,bank}` shape, so we mutate its real field rather than forking the prefix.
 *  When economy registers its API (`registerMissionEconomy`), rewards route through it instead. */
function creditWalletClean(amount: number): void {
  const w = players.entities[0]?.econ_wallet;
  if (w) w.clean = Math.max(0, w.clean + amount);
}

function toWeaponId(id: string): WeaponId | null {
  return (Object.values(WeaponId) as string[]).includes(id) ? (id as WeaponId) : null;
}

export const economyCtx: EconomyCtx = {
  addCash: (amount) => {
    if (external?.addCash) {
      external.addCash(amount);
      return;
    }
    const hud = useHudStore.getState();
    hud.patch({ cash: Math.max(0, Math.round(hud.cash + amount)) });
    creditWalletClean(amount);
  },
  addRep: (amount) => {
    if (external?.addRep) {
      external.addRep(amount);
      return;
    }
    // No shared rep wallet component in v1 — rep is owned by the economy subsystem's store, which
    // handles it once it registers via `registerMissionEconomy`. Nothing to mirror in the fallback.
    void amount;
  },
  giveWeapon: (weaponId) => {
    if (external?.giveWeapon) {
      external.giveWeapon(weaponId);
      return;
    }
    const wid = toWeaponId(weaponId);
    const p = players.entities[0];
    if (!p || !wid) return;
    if (p.weapon === undefined) world.addComponent(p, "weapon", wid);
    else p.weapon = wid;
  },
};
