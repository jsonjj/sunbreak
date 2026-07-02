import { Field, Slider, Toggle } from "../../components/primitives";
import { useSettingsStore } from "../../lib/stores";
import { patchControls } from "../../lib/settings";
import menu from "../../styles/menu.module.css";

export function ControlsTab() {
  const c = useSettingsStore((s) => s.controls);
  return (
    <div>
      <h3 className={menu.sectionTitle}>Controls</h3>
      <p className={menu.sectionSub}>Full key rebinding lands in a later build.</p>
      <Field label="Mouse sensitivity" hint="Look speed while the pointer is captured.">
        <Slider
          value={c.mouseSensitivity}
          min={0.2}
          max={2.5}
          step={0.05}
          onChange={(v) => patchControls({ mouseSensitivity: v })}
          format={(v) => v.toFixed(2)}
          ariaLabel="Mouse sensitivity"
        />
      </Field>
      <Field label="Invert look (Y)" hint="Flip vertical aiming.">
        <Toggle
          checked={c.invertY}
          onChange={(v) => patchControls({ invertY: v })}
          ariaLabel="Invert look"
        />
      </Field>
      <Field label="Toggle sprint" hint="Tap to sprint instead of holding Shift.">
        <Toggle
          checked={c.sprintToggle}
          onChange={(v) => patchControls({ sprintToggle: v })}
          ariaLabel="Toggle sprint"
        />
      </Field>
      <Field label="Toggle aim" hint="Tap to aim instead of holding.">
        <Toggle
          checked={c.aimToggle}
          onChange={(v) => patchControls({ aimToggle: v })}
          ariaLabel="Toggle aim"
        />
      </Field>
    </div>
  );
}
