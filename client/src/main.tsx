import { createRoot } from "react-dom/client";
import { App } from "./App";
// Auto-register every Wave-2 subsystem (side-effect import; must run before render).
// See client/src/game/systems-loader.ts — central wiring, not edited by subsystem agents.
import "./game/systems-loader";
import "./index.css";

const el = document.getElementById("root");
if (!el) throw new Error("Root element #root not found");

// No <StrictMode> intentionally: double-invoked effects would re-init the physics world and
// character controller. Re-enable once systems are idempotent under Strict Mode.
createRoot(el).render(<App />);
