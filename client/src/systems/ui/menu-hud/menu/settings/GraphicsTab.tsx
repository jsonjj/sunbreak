import type { QualityTier } from "@sunbreak/shared";
import { Field, Segmented, Slider, Toggle } from "../../components/primitives";
import type { Option } from "../../components/primitives";
import { useSettingsStore } from "../../lib/stores";
import { patchGraphics } from "../../lib/settings";
import menu from "../../styles/menu.module.css";

const QUALITY: Option<QualityTier>[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function GraphicsTab() {
  const g = useSettingsStore((s) => s.graphics);
  return (
    <div>
      <h3 className={menu.sectionTitle}>Graphics</h3>
      <p className={menu.sectionSub}>
        Applied live by the renderer. Lower the preset if the frame rate dips.
      </p>
      <Field label="Quality preset" hint="Overall detail, shadows and effects.">
        <Segmented
          value={g.quality}
          options={QUALITY}
          onChange={(v) => patchGraphics({ quality: v })}
          ariaLabel="Quality preset"
        />
      </Field>
      <Field label="Auto performance" hint="Scale quality at runtime to protect 60fps.">
        <Toggle
          checked={g.auto}
          onChange={(v) => patchGraphics({ auto: v })}
          ariaLabel="Auto performance"
        />
      </Field>
      <Field label="Field of view" hint="Camera field of view, in degrees.">
        <Slider
          value={g.fov}
          min={55}
          max={100}
          step={1}
          onChange={(v) => patchGraphics({ fov: v })}
          format={(v) => `${Math.round(v)}°`}
          ariaLabel="Field of view"
        />
      </Field>
      <Field label="Motion blur" hint="Camera blur at speed.">
        <Toggle
          checked={g.motionBlur}
          onChange={(v) => patchGraphics({ motionBlur: v })}
          ariaLabel="Motion blur"
        />
      </Field>
    </div>
  );
}
