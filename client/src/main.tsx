import { createRoot } from "react-dom/client";
import { App } from "./App";
// Auto-register every Wave-2 subsystem (side-effect import; must run before render).
// See client/src/game/systems-loader.ts — central wiring, not edited by subsystem agents.
import "./game/systems-loader";
// Central v1 integration: cross-subsystem data funnels + the player avatar. MUST run after the
// systems-loader (so every subsystem has self-registered) and before React renders.
import { wireIntegration } from "./game/integration";
import "./index.css";

const el = document.getElementById("root");
if (!el) throw new Error("Root element #root not found");

wireIntegration();

// No <StrictMode> intentionally: double-invoked effects would re-init the physics world and
// character controller. Re-enable once systems are idempotent under Strict Mode.
createRoot(el).render(<App />);
