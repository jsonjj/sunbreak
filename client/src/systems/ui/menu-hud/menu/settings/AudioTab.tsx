import { Field, Slider } from "../../components/primitives";
import { useSettingsStore } from "../../lib/stores";
import { patchAudio, pct } from "../../lib/settings";
import menu from "../../styles/menu.module.css";

export function AudioTab() {
  const a = useSettingsStore((s) => s.audio);
  return (
    <div>
      <h3 className={menu.sectionTitle}>Audio</h3>
      <p className={menu.sectionSub}>Mix levels are pushed live to the audio engine.</p>
      <Field label="Master">
        <Slider value={a.master} onChange={(v) => patchAudio({ master: v })} format={pct} ariaLabel="Master volume" />
      </Field>
      <Field label="Music">
        <Slider value={a.music} onChange={(v) => patchAudio({ music: v })} format={pct} ariaLabel="Music volume" />
      </Field>
      <Field label="Effects">
        <Slider value={a.sfx} onChange={(v) => patchAudio({ sfx: v })} format={pct} ariaLabel="Effects volume" />
      </Field>
      <Field label="Voice">
        <Slider value={a.voice} onChange={(v) => patchAudio({ voice: v })} format={pct} ariaLabel="Voice volume" />
      </Field>
    </div>
  );
}
