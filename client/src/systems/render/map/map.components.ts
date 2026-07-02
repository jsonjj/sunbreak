// ECS augmentation — how OTHER subsystems put an entity on the map without touching this folder.
//
// Add a `map_blip` component to any entity that has a `transform`; the map's update-phase system
// mirrors it into the blip store each tick (position pooled, zero per-frame allocation). Set
// `map_hidden` to suppress an entity that would otherwise show.
//
// Prefix rule (WAVE-2): every field is `map_`. Keep a real import + `export {}` so this file stays
// a MODULE (a bare `declare module` would silently replace `@sunbreak/shared`).
import type { MapBlipComponent } from "./mapTypes";

declare module "@sunbreak/shared" {
  interface SimComponents {
    /** Opt this entity into the minimap/map as a live blip (position read from `transform`). */
    map_blip?: MapBlipComponent;
    /** Force this entity off the map even if something set `map_blip`. */
    map_hidden?: true;
  }
}

export {};
