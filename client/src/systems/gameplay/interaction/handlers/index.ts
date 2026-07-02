// Registers all built-in verb handlers as defaults. Called once from the subsystem's init().
// Idempotent so repeated boots (HMR) don't double-register.

import { registerDefaultHandler } from "../registry";
import { vehicleEnterHandler } from "./vehicleEnter";
import { doorHandler } from "./door";
import { itemPickupHandler } from "./itemPickup";
import { npcTalkHandler } from "./npcTalk";
import { shopBuyHandler } from "./shopBuy";

let registered = false;

export function registerBuiltinHandlers(): void {
  if (registered) return;
  registered = true;
  registerDefaultHandler(vehicleEnterHandler);
  registerDefaultHandler(doorHandler);
  registerDefaultHandler(itemPickupHandler);
  registerDefaultHandler(npcTalkHandler);
  registerDefaultHandler(shopBuyHandler);
}

export { vehicleEnterHandler, doorHandler, itemPickupHandler, npcTalkHandler, shopBuyHandler };
