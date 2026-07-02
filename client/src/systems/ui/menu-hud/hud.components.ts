// ECS augmentation owned by ui/menu-hud. Prefix: `hud_`.
// Gameplay/world subsystems may tag any entity so it shows up on the HUD minimap + full map; the
// map reads these live from the ECS world (no per-frame React state). For static points of interest
// prefer the imperative `addBlip(...)` API (see ./map/blipStore.ts); for entities that move (the
// player's car, police units, peds) tag `hud_blip` and the map tracks their `transform`.
import type { BlipKind } from "./map/types";

export interface HudBlipTag {
  /** Marker kind — drives colour + icon shape (see ./map/palette.ts). */
  kind: BlipKind;
  label?: string;
  /** Optional CSS colour override (else derived from `kind`). */
  color?: string;
  /** Draw priority — higher renders on top. Default 0. */
  priority?: number;
  /** Show on the rotating minimap (default true). */
  minimap?: boolean;
  /** Show on the full-screen map (default true). */
  map?: boolean;
  /** Clamp to the minimap ring with a chevron when out of range (default true). */
  clampToEdge?: boolean;
  /** Pulsing "sonar" ring (objectives / pings). */
  sonar?: boolean;
}

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Present ⇒ this entity is drawn on the HUD minimap + map (reads its `transform`). */
    hud_blip?: HudBlipTag;
    /** Present ⇒ temporarily suppress this entity's blip. */
    hud_blipHidden?: true;
  }
}
