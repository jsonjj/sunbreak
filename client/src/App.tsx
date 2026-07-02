import { RenderCanvas } from "./render/RenderCanvas";
// DOM overlays — each is a click-through, self-z-indexed sibling of <Canvas>. One owner per widget:
//   • MenuHudRoot   (ui/menu-hud)      — HUD core (health/armor/money/wanted/weapon/speed/minimap/
//                                        toasts/interaction prompt/crosshair) + main/pause menus.
//   • GameUXRoot    (ui/game-ux)       — full-screen flow: loading, FLATLINE/BOOKED, mission cards,
//                                        the diegetic phone, and shops.
//   • WeaponWheel   (gameplay/inventory) — the radial weapon selector (Tab).
//   • DialogueOverlay (ai/dialogue-ui) — NPC conversation subtitles + choices.
//   • OnboardingOverlay (ui/onboarding) — first-run tutorial + contextual hints + Help.
//   • DebugPanels   (content/debug-tools) — dev overlays (self-gates behind ?debug).
// The v0 <HUD/> and the render/map minimap are intentionally NOT mounted — menu-hud supersedes them.
import { MenuHudRoot } from "@/systems/ui/menu-hud";
import { GameUXRoot } from "@/systems/ui/game-ux";
import { WeaponWheel } from "@/systems/gameplay/inventory";
import { DialogueOverlay } from "@/systems/ai/dialogue-ui";
import { OnboardingOverlay } from "@/systems/ui/onboarding";
import { DebugPanels } from "@/systems/content/debug-tools";

export function App() {
  return (
    <div className="app-root">
      <RenderCanvas />
      <MenuHudRoot />
      <GameUXRoot />
      <WeaponWheel />
      <DialogueOverlay />
      <OnboardingOverlay />
      <DebugPanels />
    </div>
  );
}
