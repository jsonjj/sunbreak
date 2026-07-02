// Traffic event bus (mitt). Kept in its own leaf module so hot-path systems and the public API can
// both emit/subscribe without an import cycle. Consumers: audio (engine/horn/screech/siren-yield),
// wanted-police (crime), HUD/minimap (optional blips), vehicle-gameplay (carjack).
import mitt from "mitt";
import type { TrafficEventMap } from "./types";

export const trafficEvents = mitt<TrafficEventMap>();
