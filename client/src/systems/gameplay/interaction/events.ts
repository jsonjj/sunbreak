// Typed pub/sub for interaction outcomes. Sibling subsystems (Vehicles, Inventory, Economy,
// Dialogue, Audio…) subscribe here to react to dispatched interactions WITHOUT importing this
// folder's internals, and without this folder importing theirs. They may instead fully override a
// verb via `registerHandler`; both paths are supported.

import mitt, { type Emitter } from "mitt";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { InteractionActionSlot, InteractionKind } from "./types";

export type InteractionEventMap = {
  /** Focus changed (id === null when nothing is focused). */
  focus: { id: string | null; kind: InteractionKind | null };
  /** Any interactable was successfully triggered. */
  interact: {
    id: string;
    kind: InteractionKind;
    entity: ClientEntity;
    action: InteractionActionSlot;
  };
  vehicle_enter: { entity: ClientEntity; vehicleNetId: number | null; seat: number };
  item_pickup: { entity: ClientEntity; itemId?: string; qty: number };
  door: { entity: ClientEntity; open: boolean };
  npc_talk: { entity: ClientEntity; npcId?: string };
  shop_buy: { entity: ClientEntity; sku?: string; price?: number };
};

export type InteractionEvents = Emitter<InteractionEventMap>;

/** Process-wide interaction event bus. */
export const interactionEvents: InteractionEvents = mitt<InteractionEventMap>();
