// ─────────────────────────────────────────────────────────────────────────────
// content/data-format (client) — the authoring contract for ALL game content.
// ─────────────────────────────────────────────────────────────────────────────
// A lib-only subsystem: it registers no per-frame systems. Instead it exposes the single
// zod schema layer (→ runtime validation AND TS types), validated loaders, a `define*` +
// `register*` authoring API, an in-memory content registry, and cross-file ref-integrity —
// all imported by sibling subsystems (map/vehicles/weapons/npcs/missions) for their data.
//
// Consume it from any client subsystem, e.g.:
//   import { Vehicle, getVehicle, defineWeapon, type Mission } from "@/systems/content/data-format";
//
// Self-registration: `registerModule(mod)` runs at module load (the systems-loader eager-imports
// this file). `init()` seeds first-party content into the registry and, in dev, logs any dangling
// cross-references. Everything here is throw-proof so it can never break v0 at boot.
import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import { registerSeedContent } from "./content";
import { checkReferentialIntegrity } from "./refs";
import { loadJsonContent } from "./load";

// ── Public API ────────────────────────────────────────────────────────────────
export * from "./schemas"; // schema values + colocated z.infer types + kind registry
export * from "./define"; // defineVehicle / defineWeapon / defineNpc / defineMission / defineMap
export * from "./registry"; // register*/get*/all*/has*, registerContent, getManifest, clearRegistry
export * from "./load"; // parse*/safeParse*, parseContent, detectKind, loadJsonContent, …
export * from "./refs"; // checkReferentialIntegrity, refIntegrityErrors

type W = typeof world;

export const mod: SubsystemModule<W> = {
  id: "content/data-format",
  init() {
    // Seed first-party content synchronously (non-throwing, idempotent).
    try {
      registerSeedContent();
    } catch (err) {
      console.warn("[content/data-format] seed registration failed:", err);
    }

    // Discover any JSON-authored content in this folder (async, best-effort).
    void loadJsonContent().catch((err) => {
      console.warn("[content/data-format] JSON content load failed:", err);
    });

    // Dev-only: surface dangling cross-references (never blocks).
    if (import.meta.env.DEV) {
      try {
        const issues = checkReferentialIntegrity();
        if (issues.length > 0) {
          console.warn(
            `[content/data-format] ${issues.length} referential-integrity issue(s):`,
            issues,
          );
        }
      } catch (err) {
        console.warn("[content/data-format] ref-integrity check failed:", err);
      }
    }
  },
};

registerModule(mod);
