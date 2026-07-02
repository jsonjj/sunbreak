// The single DOM overlay for game-ux. The integrator mounts this as a sibling of the R3F
// <Canvas> (next to <HUD/>) inside App.tsx. Full-viewport, click-through root; each surface opts
// back into pointer events and self-orders via z-index tokens. Re-renders only on discrete
// store changes — never per frame.
import { useEffect } from "react";
import { AnimatePresence } from "motion/react";
import "./theme/tokens.css";
import "./theme/global.css";
import { useUxStore } from "./state/uiStore";
import { wireEvents } from "./state/wireEvents";
import { useLoadingVisible } from "./screens/useLoadingVisible";
import { LoadingScreen } from "./screens/LoadingScreen";
import { StateScreen } from "./screens/StateScreen";
import { StartCard } from "./screens/mission/StartCard";
import { ResultCard } from "./screens/mission/ResultCard";
import { ToastLayer } from "./overlays/ToastLayer";
import { Phone } from "./phone/Phone";
import { Shop } from "./shop/Shop";

export function GameUXRoot() {
  const stateData = useUxStore((s) => s.state);
  const missionStart = useUxStore((s) => s.missionStart);
  const missionResult = useUxStore((s) => s.missionResult);
  const loadingVisible = useLoadingVisible();

  // Idempotent: safe if the subsystem init() already wired events (belt-and-suspenders so the
  // overlay also works when mounted standalone, e.g. in isolation/testing).
  useEffect(() => wireEvents(), []);

  return (
    <div className="ux-root">
      <ToastLayer />
      <Phone />
      <Shop />

      <AnimatePresence>
        {missionStart && <StartCard key={missionStart.id} data={missionStart} />}
      </AnimatePresence>

      <AnimatePresence>
        {missionResult && <ResultCard key={missionResult.id} data={missionResult} />}
      </AnimatePresence>

      <AnimatePresence>
        {stateData && <StateScreen key={stateData.variant} data={stateData} />}
      </AnimatePresence>

      <AnimatePresence>{loadingVisible && <LoadingScreen key="loading" />}</AnimatePresence>
    </div>
  );
}
