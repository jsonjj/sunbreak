// render/materials — shared PBR material library + wetness/night uniform bus for SUNBREAK.
//
// Self-registers via the Wave-2 registry (side effect below): two render-phase systems drive the
// uniform bus and bind registry materials to `mat_defId`-tagged entities through the ECS↔R3F bridge.
// This is the ONE folder other subsystems import materials from — see ./api for the public surface.
//
// NOTE: `three-custom-shader-material` (spec's CSM) and `three-stdlib` are not installed/reachable
// in this repo, so custom surface logic is injected via three's built-in `onBeforeCompile` (the same
// mechanism CSM wraps) and KTX2Loader is imported from the `three` package. See ./masters/inject.ts.
import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import "./mat.components";
import { uniformBusSystem, applyMaterialsSystem } from "./system";
import { MaterialRegistry } from "./MaterialRegistry";
import { disposeKtx2 } from "./textures/ktx2";

type W = typeof world;

export const mod: SubsystemModule<W> = {
  id: "render/materials",
  systems: [uniformBusSystem, applyMaterialsSystem],
  init() {
    return () => {
      MaterialRegistry.disposeAll();
      disposeKtx2();
    };
  },
};

registerModule(mod);

// Public API (the module other subsystems import from).
export * from "./api";
