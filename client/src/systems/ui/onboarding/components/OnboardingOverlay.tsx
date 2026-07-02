// Root DOM overlay — the single component the integrator mounts as a sibling of <HUD/> (never
// inside <Canvas>). Portals to <body>, renders from the store (zero per-frame React work), and
// bundles the objective tracker, hint toast, first-run card, and Help overlay. Honors the
// in-game accessibility settings (text-scale + reduced motion).
import { useEffect } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useSettingsStore } from "@/stores/settings.store";
import { ensureStyles } from "../styles";
import { ObjectiveTracker } from "./ObjectiveTracker";
import { HintToast } from "./HintToast";
import { KeyPromptCard } from "./KeyPromptCard";
import { HelpControlsScreen } from "./HelpControlsScreen";

export function OnboardingOverlay() {
  const hudScale = useSettingsStore((s) => s.accessibility.hudScale);
  const reduceShake = useSettingsStore((s) => s.accessibility.reduceShake);
  const reduceFlashing = useSettingsStore((s) => s.accessibility.reduceFlashing);

  useEffect(() => {
    ensureStyles();
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="onb-root"
      data-reduced={reduceShake || reduceFlashing ? "true" : "false"}
      style={{ "--onb-scale": String(hudScale) } as CSSProperties}
    >
      <ObjectiveTracker />
      <HintToast />
      <KeyPromptCard />
      <HelpControlsScreen />
    </div>,
    document.body,
  );
}
