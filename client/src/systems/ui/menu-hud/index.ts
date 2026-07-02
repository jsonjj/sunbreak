// ui/menu-hud — the SUNBREAK React DOM overlay: in-game HUD + main menu, pause & settings.
// Self-registers on import (per WAVE-2 protocol). It owns no per-frame ECS systems: gameplay
// subsystems WRITE the shared HUD stores (client/src/stores) and the exported <MenuHudRoot/>
// READS them (transient subscriptions for per-frame values). See ./lib/stores.ts for the map.
import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
// Keep the `hud_*` ECS augmentation (minimap blips) in the program.
import "./hud.components";

export const menuHud: SubsystemModule = {
  id: "ui/menu-hud",
};

registerModule(menuHud);

// ── Public surface (mount <MenuHudRoot/> as a sibling of <Canvas>, replacing v0 <HUD/>) ──
export { MenuHudRoot } from "./MenuHudRoot";
export { GameHud } from "./hud/GameHud";
export { CapturePrompt } from "./hud/CapturePrompt";
export { Minimap } from "./hud/Minimap";
export { MainMenu } from "./menu/MainMenu";
export { PauseMenu } from "./menu/PauseMenu";
export { BootLoading } from "./menu/BootLoading";
export { SettingsScreen } from "./menu/settings/SettingsScreen";
export { usePauseControls } from "./lib/usePauseControls";
export type { HudBlipTag } from "./hud.components";
