import type { ColorblindMode } from "@sunbreak/shared";
import { Field, Select, Slider, Toggle } from "../../components/primitives";
import type { Option } from "../../components/primitives";
import { useSettingsStore } from "../../lib/stores";
import { patchAccessibility, pct } from "../../lib/settings";
import menu from "../../styles/menu.module.css";

const COLORBLIND: Option<ColorblindMode>[] = [
  { value: "none", label: "None" },
  { value: "protanopia", label: "Protanopia" },
  { value: "deuteranopia", label: "Deuteranopia" },
  { value: "tritanopia", label: "Tritanopia" },
];

export function AccessibilityTab() {
  const a = useSettingsStore((s) => s.accessibility);
  return (
    <div>
      <h3 className={menu.sectionTitle}>Accessibility</h3>
      <p className={menu.sectionSub}>HUD scale, contrast and motion — applied instantly.</p>
      <Field label="HUD scale" hint="Size of the on-screen HUD.">
        <Slider
          value={a.hudScale}
          min={0.75}
          max={1.5}
          step={0.05}
          onChange={(v) => patchAccessibility({ hudScale: v })}
          format={pct}
          ariaLabel="HUD scale"
        />
      </Field>
      <Field label="HUD opacity">
        <Slider
          value={a.hudOpacity}
          min={0.25}
          max={1}
          step={0.05}
          onChange={(v) => patchAccessibility({ hudOpacity: v })}
          format={pct}
          ariaLabel="HUD opacity"
        />
      </Field>
      <Field label="Reduce screen shake">
        <Toggle
          checked={a.reduceShake}
          onChange={(v) => patchAccessibility({ reduceShake: v })}
          ariaLabel="Reduce screen shake"
        />
      </Field>
      <Field label="Reduce flashing" hint="Calms pulsing/flashing HUD elements.">
        <Toggle
          checked={a.reduceFlashing}
          onChange={(v) => patchAccessibility({ reduceFlashing: v })}
          ariaLabel="Reduce flashing"
        />
      </Field>
      <Field label="Colorblind mode" hint="Adjusts HUD semantic colors.">
        <Select
          value={a.colorblind}
          options={COLORBLIND}
          onChange={(v) => patchAccessibility({ colorblind: v })}
          ariaLabel="Colorblind mode"
        />
      </Field>
      <Field label="Subtitles">
        <Toggle
          checked={a.subtitles}
          onChange={(v) => patchAccessibility({ subtitles: v })}
          ariaLabel="Subtitles"
        />
      </Field>
    </div>
  );
}
