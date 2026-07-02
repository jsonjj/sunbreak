// Finish-phase bridge: mirror the active wallet into (a) the player ECS entity as `econ_wallet`
// for other sim systems, and (b) the shared HUD store's `cash`/`bank` fields so ANY HUD surface
// (v0 or ui/menu-hud) shows money with zero wiring. Throttled + no-op-skipped like hudSyncSystem.
import type { System } from "@sunbreak/shared";
import { queries } from "@/ecs/queries";
import { useHudStore } from "@/stores/hud.store";
import { world } from "@/ecs/world";
import { HUD_SYNC_RATE } from "../constants";
import { useEconomy } from "../store/economyStore";

type W = typeof world;

let acc = 0;
const last = { cash: -1, bank: -1 };

export const walletSyncSystem: System<W> = {
  name: "econ.walletSync",
  phase: "finish",
  order: 10,
  fn: (w, dt) => {
    acc += dt;
    if (acc < HUD_SYNC_RATE) return;
    acc = 0;

    const s = useEconomy.getState();
    const wallet = s.wallets[s.active];
    const cash = wallet.cash.clean;
    const bank = wallet.bank;

    // Reflect finances onto the player entity (seam for other ECS systems).
    const player = queries.players.entities[0];
    if (player) {
      if (player.econ_wallet) {
        player.econ_wallet.char = s.active;
        player.econ_wallet.clean = wallet.cash.clean;
        player.econ_wallet.dirty = wallet.cash.dirty;
        player.econ_wallet.bank = bank;
      } else {
        w.addComponent(player, "econ_wallet", {
          char: s.active,
          clean: wallet.cash.clean,
          dirty: wallet.cash.dirty,
          bank,
        });
      }
    }

    // Mirror into the shared HUD store (skip redundant writes).
    if (cash === last.cash && bank === last.bank) return;
    last.cash = cash;
    last.bank = bank;
    useHudStore.getState().patch({ cash, bank });
  },
};
