// ECS augmentation for the Economy subsystem. Declaration-merges `econ_`-prefixed fields into
// the shared `SimComponents` from INSIDE this folder (never edits shared). All fields optional
// or presence-tags, all serializable POJOs. See WAVE-2 protocol §(c).
import type { CharacterId } from "@sunbreak/shared";
import type { ShopKind } from "./types";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /**
     * Mirror of a character's live finances reflected onto the player entity so other ECS
     * systems can read money without importing the store. Written by `walletSyncSystem`.
     */
    econ_wallet?: { char: CharacterId; clean: number; dirty: number; bank: number };

    /** A collectible cash pickup in the world. `pickupSystem` credits + despawns it on contact. */
    econ_pickup?: { amount: number; dirty?: boolean };

    /** Marks an entity as a storefront/vendor trigger (for interaction/blip subsystems). */
    econ_shop?: { kind: ShopKind; id?: string };
  }
}

export {};
