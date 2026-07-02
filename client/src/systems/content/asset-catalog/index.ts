// content/asset-catalog (client) — the single, typed catalog of every third-party art/audio
// asset, keyed by stable logical keys (+ shared gameplay enums) → CC0/CC-BY source & license
// metadata + `/public/assets/...` paths + procedural placeholders so the game runs TODAY without
// any real binary downloaded. Implements gta6-build/08-content/asset-catalog.md; obeys WAVE-2.
//
// This subsystem is config-only (no per-frame systems): it self-registers for discovery/boot
// logging, and its real value is the exported API below that other subsystems import BY KEY.
//
// Integrator quick-start:
//   import { getPlaceholderModel, vehicleAssetKey } from "@/systems/content/asset-catalog";
//   scene.add(getPlaceholderModel(vehicleAssetKey(VehicleId.Sedan)));   // runs now (placeholder)
//   // later, once /public/assets is populated:
//   configureAssetCatalog({ useRealAssets: true });                     // → real GLB, auto-fallback

import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";

// Public API — resolve assets by key, get placeholders/urls, and read provenance.
export * from "./types";
export * from "./sources";
export * from "./catalog";
export * from "./placeholders";
export * from "./loader";
export * from "./credits";

/** Config-only subsystem module (no systems); registered so the loader/boot sees us. */
export const assetCatalog: SubsystemModule = {
  id: "content/asset-catalog",
};

registerModule(assetCatalog); // required WAVE-2 self-registration side effect
