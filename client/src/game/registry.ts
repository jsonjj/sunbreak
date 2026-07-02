import { SystemRegistry } from "@sunbreak/shared";
import { world } from "../ecs/world";
import { hudSyncSystem } from "./hudSyncSystem";

type W = typeof world;

/** The client system registry. Subsystems register systems into named phases; <SystemsRunner>
 *  runs the non-physics phases each frame (physics phases are anchored by Rapier hooks). */
export const registry = new SystemRegistry<W>();

registry.register(hudSyncSystem);

/** Re-exported so Wave-2 subsystems can register their own systems/modules. */
export const registerSystem = registry.register.bind(registry);
export const registerModule = registry.registerModule.bind(registry);
