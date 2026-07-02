import { useState } from "react";
import { useSettingsStore } from "../../lib/stores";
import { Button, Panel, Tabs } from "../../components/primitives";
import type { TabItem } from "../../components/primitives";
import {
  IconMonitor,
  IconAudio,
  IconGamepad,
  IconAccessibility,
  IconReset,
  IconCheck,
} from "../../lib/icons";
import { GraphicsTab } from "./GraphicsTab";
import { AudioTab } from "./AudioTab";
import { ControlsTab } from "./ControlsTab";
import { AccessibilityTab } from "./AccessibilityTab";
import menu from "../../styles/menu.module.css";

type Tab = "graphics" | "audio" | "controls" | "accessibility";

const TABS: TabItem<Tab>[] = [
  { value: "graphics", label: "Graphics", icon: <IconMonitor size={17} /> },
  { value: "audio", label: "Audio", icon: <IconAudio size={17} /> },
  { value: "controls", label: "Controls", icon: <IconGamepad size={17} /> },
  { value: "accessibility", label: "Accessibility", icon: <IconAccessibility size={17} /> },
];

/** Settings dialog (used from the main menu and pause). All controls bind to `settingsStore`;
 *  other subsystems (renderer/audio/input) consume it. `embedded` drops the opaque backdrop. */
export function SettingsScreen({
  onClose,
  embedded = false,
}: {
  onClose: () => void;
  embedded?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("graphics");
  const reset = useSettingsStore((s) => s.reset);

  return (
    <div className={menu.screen}>
      {embedded ? null : <div className={menu.backdrop} />}
      <div className={menu.center}>
        <Panel className={menu.dialog}>
          <div className={menu.dialogHead}>
            <div>
              <div className={menu.dialogKicker}>Settings</div>
              <div className={menu.dialogTitle}>Tune your experience</div>
            </div>
            <Button variant="primary" icon={<IconCheck size={16} />} onClick={onClose}>
              Done
            </Button>
          </div>

          <div className={menu.dialogBody}>
            <div className={menu.rail}>
              <Tabs value={tab} items={TABS} onChange={setTab} />
              <div className={menu.railSpacer} />
              <Button variant="ghost" icon={<IconReset size={16} />} block onClick={reset}>
                Reset to defaults
              </Button>
            </div>

            <div className={menu.content}>
              {tab === "graphics" ? <GraphicsTab /> : null}
              {tab === "audio" ? <AudioTab /> : null}
              {tab === "controls" ? <ControlsTab /> : null}
              {tab === "accessibility" ? <AccessibilityTab /> : null}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
