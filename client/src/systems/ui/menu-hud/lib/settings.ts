import type { SettingsState } from "@sunbreak/shared";
import { useSettingsStore } from "./stores";

// The settings store exposes only a few named setters; for the rest we drive it through the
// always-available Zustand `setState` (persist middleware still writes localStorage). We never
// edit the store file itself — the schema stays owned by client/src/stores/settings.store.ts.

export function patchAudio(p: Partial<SettingsState["audio"]>): void {
  useSettingsStore.setState((s) => ({ audio: { ...s.audio, ...p } }));
}
export function patchGraphics(p: Partial<SettingsState["graphics"]>): void {
  useSettingsStore.setState((s) => ({ graphics: { ...s.graphics, ...p } }));
}
export function patchControls(p: Partial<SettingsState["controls"]>): void {
  useSettingsStore.setState((s) => ({ controls: { ...s.controls, ...p } }));
}
export function patchAccessibility(p: Partial<SettingsState["accessibility"]>): void {
  useSettingsStore.setState((s) => ({ accessibility: { ...s.accessibility, ...p } }));
}

export const pct = (v: number): string => `${Math.round(v * 100)}%`;
