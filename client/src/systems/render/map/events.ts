// Typed event bus for map <-> other-subsystem hand-offs (fast-travel, waypoint/route notices).
// mitt is a pre-installed dep. Other systems: `import { mapEvents } from "@/systems/render/map"`.
import mitt from "mitt";
import type { Emitter } from "mitt";
import type { RouteResult, Vec2 } from "./mapTypes";

export type MapEvents = {
  /** Fired whenever the active waypoint changes (null = cleared). */
  waypointSet: { at: Vec2 | null };
  /** Fired after the router produces a new GPS route (null = cleared/unreachable). */
  routeUpdated: { route: RouteResult | null };
  /** Player requested a fast-travel jump. World/Streaming should teleport the player here. */
  fastTravelRequest: { at: Vec2; name?: string };
};

export const mapEvents: Emitter<MapEvents> = mitt<MapEvents>();
