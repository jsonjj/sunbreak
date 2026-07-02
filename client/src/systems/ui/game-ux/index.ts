// Subsystem: ui/game-ux (client) — full-screen game UX & flow surfaces: loading, FLATLINE/
// BOOKED state screens, mission cards, toasts, the diegetic phone (AI-NPC contacts), and shops.
// Implements gta6-build/07-ui/game-ux.md within the WAVE-2 ownership rules (this folder only).
//
// Self-registers on import (systems-loader globs every subsystem's root index). The registered
// module contributes ONE finish-phase ECS system (player death/revive watcher) and wires the
// gameplay->UI event bus into the store on init(). The React overlay itself is NOT mounted here
// — the integrator mounts <GameUXRoot/> beside <Canvas>/<HUD> in App.tsx (see wiring notes).
import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import "./game-ux.components"; // ECS augmentation (ux_* fields via declaration merging)
import { deathWatch } from "./system/deathWatch";
import { wireEvents } from "./state/wireEvents";

type W = typeof world;

export const mod: SubsystemModule<W> = {
  id: "ui/game-ux",
  systems: [
    // Mirror sim death/revive into the UI bus (finish phase = "mirror sim -> Zustand for HUD").
    { name: "ux.deathWatch", phase: "finish", order: 50, fn: deathWatch },
  ],
  init() {
    // Wire the typed event bus into the store now, so events work even before <GameUXRoot>
    // mounts. Idempotent; returns the unwire cleanup for unregister/HMR.
    return wireEvents();
  },
};

registerModule(mod);

// ───────────────────────────── Public API (for the integrator + HUD) ─────────────────────────
// Overlay root + individual surfaces (mount <GameUXRoot/>, or compose pieces yourself).
export { GameUXRoot } from "./GameUXRoot";
export { LoadingScreen } from "./screens/LoadingScreen";
export { StateScreen } from "./screens/StateScreen";
export { StartCard } from "./screens/mission/StartCard";
export { ResultCard } from "./screens/mission/ResultCard";
export { ToastLayer } from "./overlays/ToastLayer";
export { Phone } from "./phone/Phone";
export { Shop } from "./shop/Shop";

// Event bus (gameplay systems emit; UI consumes).
export { gameEvents, emitUx } from "./state/bus";
export type { GameUxEvents, UxRewards, ToastKind, UxCurrency } from "./state/bus";

// Store (screen FSM, cinematic flag, toasts, phone, shop) + convenience actions.
export { useUxStore, TOAST_CAP } from "./state/uiStore";
export type {
  UxState,
  GameScreen,
  Cinematic,
  UxToast,
  MissionStartData,
  MissionResultData,
  StateScreenData,
} from "./state/uiStore";

// Economy seam (swap the default HUD-backed impl for the real gameplay/economy API).
export { getEconomy, setEconomyApi } from "./state/economyAdapter";
export type { EconomyApi, Wallet, Grants } from "./state/economyAdapter";

// Shop catalog (data-driven vendors).
export { getCatalog, registerCatalog, shopVendorIds } from "./shop/catalog";
export type { ShopItem, ShopCatalog } from "./shop/catalog";

// Phone personas / threads.
export { PERSONAS, personaById } from "./phone/personas";
export type { Persona } from "./phone/personas";
export { streamNpc } from "./phone/npcClient";
export type { ChatMsg } from "./phone/npcClient";

// Shared UI kit (HUD imports these too).
export * from "./kit";

// Opt-in key bindings + event wiring helpers.
export { bindDefaultKeys } from "./state/bindKeys";
export { wireEvents } from "./state/wireEvents";
