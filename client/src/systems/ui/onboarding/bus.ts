// Typed, tiny game-event bus the onboarding subsystem subscribes to.
//
// WHY LOCAL: the ideal home for this is `shared/src/events.ts` + `client/src/events/bus.ts`,
// but Wave-2 file-ownership forbids touching anything outside our folder, so the bus lives
// here and is re-exported from `index.ts`. Producers (input / player / vehicle / combat) can
// `import { bus, emitGameEvent } from "@/systems/ui/onboarding"` and emit; onboarding
// subscribes. Until those producers emit, our own `probe`/`runner` synthesise the same events
// from the REAL input singleton + ECS truth, so the whole flow works solo today.
import mitt from "mitt";
import type { Emitter } from "mitt";

export type MoveDir = "fwd" | "back" | "left" | "right";

/**
 * The producer↔consumer event contract. A superset of the spec's `GameEvents`:
 *  - `player:*`   raw local-player inputs (safe to synthesise — they ARE the player's input)
 *  - `vehicle:*` / `combat:*` / `zone:*`  semantic gameplay events owned by real subsystems;
 *    we only synthesise these from ECS truth or explicit tutorial fallbacks.
 *  - `player:vehicleKey`  internal fallback so the drive beat is completable before the
 *    Vehicles subsystem emits authoritative `vehicle:enter`.
 */
export type OnbGameEvents = {
  "player:move": { dir: MoveDir };
  "player:look": { dx: number; dy: number };
  "player:sprint": void;
  "player:jump": void;
  "player:interact": void;
  "player:vehicleKey": void;
  "vehicle:enter": { id: string };
  "vehicle:exit": void;
  "vehicle:speed": { kmh: number };
  "combat:aimStart": void;
  "combat:fire": void;
  "combat:hitTarget": { id: string };
  "combat:reload": void;
  "zone:enter": { id: string };
  "hud:open": { panel: string };
  "onboarding:complete": void;
};

export type OnbEventKey = keyof OnbGameEvents;

/** The singleton event bus. */
export const bus: Emitter<OnbGameEvents> = mitt<OnbGameEvents>();

/** Every event key — handy for wildcard (un)subscription. */
export const EVENT_KEYS: readonly OnbEventKey[] = [
  "player:move",
  "player:look",
  "player:sprint",
  "player:jump",
  "player:interact",
  "player:vehicleKey",
  "vehicle:enter",
  "vehicle:exit",
  "vehicle:speed",
  "combat:aimStart",
  "combat:fire",
  "combat:hitTarget",
  "combat:reload",
  "zone:enter",
  "hud:open",
  "onboarding:complete",
] as const;

/**
 * Ergonomic emit helper. Payload arg is required only for events that carry data:
 *   emitGameEvent("player:jump");
 *   emitGameEvent("vehicle:enter", { id: "verano" });
 */
export function emitGameEvent<K extends OnbEventKey>(
  ...args: OnbGameEvents[K] extends void ? [type: K] : [type: K, payload: OnbGameEvents[K]]
): void {
  const [type, payload] = args as unknown as [K, OnbGameEvents[K]];
  bus.emit(type, payload);
}
