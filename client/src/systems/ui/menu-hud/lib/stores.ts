// ─────────────────────────────────────────────────────────────────────────────
// The gameplay → HUD READ MODEL (single import surface for this subsystem).
// ─────────────────────────────────────────────────────────────────────────────
// These Zustand stores live OUTSIDE this folder (client/src/stores) and are the
// documented interface between gameplay and the UI. Gameplay subsystems WRITE them
// (via `useHudStore.getState().patch(...)` and the shared HUD-sync bridge); this
// subsystem only READS them:
//   • per-frame fields (health/armor/stamina/speed/ammo/ability) → transient DOM writes
//   • discrete fields (cash/weapon/heat/inVehicle/blips)          → selector hooks
//
// Which gameplay subsystem feeds which field (prefix → store field):
//   stat_*   → health, armor, stamina           (gameplay/stats)
//   econ_*   → cash, bank                        (gameplay/economy)
//   wanted_* → heat  (0..5 wanted stars)         (gameplay/wanted)
//   vg_*     → speedKmh, inVehicle               (gameplay/vehicle-gameplay)
//   combat_* → weapon, ammoClip, ammoReserve     (gameplay/combat)
//   *        → ability, blips                    (abilities / world-streaming)
export { useHudStore } from "@/stores/hud.store";
export { useGameStore } from "@/stores/game.store";
export { useUiStore } from "@/stores/ui.store";
export { useSettingsStore } from "@/stores/settings.store";
export { useInputStore } from "@/stores/input.store";

export type {
  HudStoreState,
  GameStoreState,
  UiStoreState,
  SettingsState,
  Blip,
  BlipKind,
  HeatTier,
  GamePhase,
  PauseTab,
} from "@sunbreak/shared";
