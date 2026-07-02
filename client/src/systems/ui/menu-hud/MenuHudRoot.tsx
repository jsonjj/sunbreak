import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cx } from "./lib/cx";
import { usePauseControls } from "./lib/usePauseControls";
import { useGameStore, useSettingsStore } from "./lib/stores";
import { GameHud } from "./hud/GameHud";
import { CapturePrompt } from "./hud/CapturePrompt";
import { BootLoading } from "./menu/BootLoading";
import { MainMenu } from "./menu/MainMenu";
import { PauseMenu } from "./menu/PauseMenu";
import { SettingsScreen } from "./menu/settings/SettingsScreen";
import theme from "./styles/theme.module.css";
import hud from "./styles/hud.module.css";

/**
 * The single overlay the integrator mounts as a sibling of `<Canvas>` (replacing the v0
 * `<HUD/>`). It routes on `gameStore.phase`, applies HUD accessibility settings to its own
 * root, and wires the GTA-like pause flow. Everything below is DOM — it never enters R3F.
 */
export function MenuHudRoot() {
  const phase = useGameStore((s) => s.phase);
  const a11y = useSettingsStore((s) => s.accessibility);
  const rootRef = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  usePauseControls();

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.style.setProperty("--sb-hud-scale", String(a11y.hudScale));
    el.style.setProperty("--sb-hud-opacity", String(a11y.hudOpacity));
  }, [a11y.hudScale, a11y.hudOpacity]);

  // Settings is only reachable from menu/pause — close it whenever we leave those screens.
  useEffect(() => {
    if (phase !== "menu" && phase !== "paused") setSettingsOpen(false);
  }, [phase]);

  const rootClass = cx(
    theme.theme,
    hud.root,
    a11y.reduceFlashing && theme.reduceFlash,
    a11y.reduceShake && theme.reduceShake,
    a11y.colorblind === "protanopia" && theme.cbProtanopia,
    a11y.colorblind === "deuteranopia" && theme.cbDeuteranopia,
    a11y.colorblind === "tritanopia" && theme.cbTritanopia,
  );

  const openSettings = () => setSettingsOpen(true);
  const closeSettings = () => setSettingsOpen(false);

  const inGame = phase === "playing" || phase === "paused" || phase === "cutscene";

  return (
    <div ref={rootRef} className={rootClass}>
      {phase === "boot" || phase === "loading" ? <BootLoading /> : null}
      {phase === "menu" ? <MainMenu onOpenSettings={openSettings} /> : null}

      {inGame ? <GameHud cinematic={phase === "cutscene"} /> : null}
      {phase === "playing" ? <CapturePrompt /> : null}
      {phase === "paused" ? <PauseMenu onOpenSettings={openSettings} /> : null}

      {settingsOpen && (phase === "menu" || phase === "paused") ? (
        <SettingsScreen onClose={closeSettings} />
      ) : null}
    </div>
  );
}
