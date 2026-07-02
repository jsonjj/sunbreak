// Typed gameplay -> UI event bus (mitt, ~200B). This decouples the sim/ECS systems (plain
// TS, no React) from the DOM overlay: gameplay emits discrete events, `wireEvents` maps them
// into the Zustand UI store, and React re-renders only the affected overlay.
//
// NOTE ON OWNERSHIP: the spec locates this bus at `shared/src/ui/events.ts` so every
// subsystem shares one instance. This wave forbids editing `shared/**`, so the bus lives here
// and is exported as the public seam. See index.ts `wiring notes`: other subsystems either
// import `gameEvents` from `@/systems/ui/game-ux`, or the integrator promotes this module to
// `shared` and re-points imports.
import mitt from "mitt";

/** Currency buckets used across wallet / shop / toasts (canon: clean / dirty / crew stash). */
export type UxCurrency = "clean" | "dirty" | "stash";

/** What a mission result grants; mirrored into toasts + economy. */
export interface UxRewards {
  cash?: number;
  rep?: number;
  items?: string[];
}

export type ToastKind = "cash" | "pickup" | "info" | "objective" | "heat" | "combat" | "save";

/** The full gameplay->UI event map. Keep payloads serializable POJOs. */
export type GameUxEvents = {
  // World / streaming
  "loading:begin": { label?: string };
  "loading:end": void;

  // Player state (from Player/Combat/Wanted)
  "player:death": { cause?: string };
  "player:revive": void;
  "player:busted": { fee?: number; heatCleared?: boolean } | void;
  "player:released": void;

  // Missions ("Scores" per economy canon)
  "mission:start": { id: string; title: string; giver: string; objective: string };
  "mission:objective": { id: string; text: string };
  "mission:pass": { id: string; title?: string; rewards?: UxRewards; medal?: string };
  "mission:fail": { id: string; title?: string; reason: string };
  // UI -> gameplay signals from the result card (Missions listens):
  "mission:retry": { id: string };
  "mission:continue": { id: string };

  // Notifications
  toast: {
    kind?: ToastKind;
    text: string;
    sub?: string;
    icon?: string;
    ttl?: number;
    priority?: number;
  };

  // Economy
  "economy:wallet": { clean: number; dirty: number; stash: number };

  // Surfaces
  "shop:open": { vendorId: string };
  "shop:close": void;
  "phone:open": { app?: string } | void;
  "phone:close": void;
  "phone:toggle": void;
  "phone:message": { npcId: string; preview: string };
};

/** Singleton typed bus. Import and `gameEvents.emit(...)` from any gameplay system. */
export const gameEvents = mitt<GameUxEvents>();

/** Narrow helper so callers get full payload typing at emit sites. */
export function emitUx<K extends keyof GameUxEvents>(
  type: K,
  ...payload: GameUxEvents[K] extends void ? [] : [GameUxEvents[K]]
): void {
  // mitt's emit is (type, event) — forward the optional payload as-is.
  (gameEvents.emit as (t: K, e?: GameUxEvents[K]) => void)(type, payload[0]);
}
