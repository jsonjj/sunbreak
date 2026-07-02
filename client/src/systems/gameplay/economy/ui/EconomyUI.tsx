// Economy UI root — the single component the integrator (or ui/menu-hud) mounts as a DOM
// sibling of <HUD/>. It is NOT hand-mounted here (see WAVE-2 protocol); mounting is the
// integrator's one-line seam. Renders the always-on wallet + toggleable shop/skills panels.
import { useEffect, useState } from "react";
import "./economy.css";
import { ShopPanel } from "./ShopPanel";
import { SkillScreen } from "./SkillScreen";
import { WalletHUD } from "./WalletHUD";

type Panel = "shop" | "skills" | null;

export function EconomyUI() {
  const [panel, setPanel] = useState<Panel>(null);

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  return (
    <div className="econ-root">
      <WalletHUD onOpenShop={() => setPanel("shop")} onOpenSkills={() => setPanel("skills")} />
      {panel === "shop" && <ShopPanel onClose={() => setPanel(null)} />}
      {panel === "skills" && <SkillScreen onClose={() => setPanel(null)} />}
    </div>
  );
}

export default EconomyUI;
