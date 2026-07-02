// ECS augmentation owned by ui/menu-hud. Prefix: `hud_`.
// Gameplay/world subsystems may tag any entity so it shows up on the HUD minimap/radar;
// the <Minimap/> reads these live from the ECS world (no per-frame React state).
import type { BlipKind } from "@sunbreak/shared";

export interface HudBlipTag {
  kind: BlipKind;
  label?: string;
  /** Optional CSS color override for the radar dot (else derived from `kind`). */
  color?: string;
  /** Optional draw priority — higher renders on top. Default 0. */
  priority?: number;
}

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Present ⇒ this entity is drawn on the HUD radar (reads its `transform`). */
    hud_blip?: HudBlipTag;
    /** Present ⇒ temporarily suppress this entity's radar blip. */
    hud_blipHidden?: true;
  }
}
