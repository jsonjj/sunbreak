// Contextual-hint registry. Any subsystem can queue a hint via `registerHint(def)` (re-exported
// from index.ts). Each hint fires the first time its trigger event is relevant, subject to
// `once` + `cooldownMs`; the runner enforces a global max-per-minute and single-slot display.
import { InputAction } from "@sunbreak/shared";
import type { OnbEventKey, OnbGameEvents } from "./bus";
import type { I18nKey } from "./i18n/en";

export interface HintDef {
  id: string;
  /** Event that can trigger this hint. */
  on: OnbEventKey;
  /** Optional extra predicate over the event payload. */
  when?: (payload: OnbGameEvents[OnbEventKey]) => boolean;
  /** Fire at most once ever (persisted via seenHints). Default true. */
  once?: boolean;
  /** Minimum ms between fires when not `once`. Default 20000. */
  cooldownMs?: number;
  /** i18n key; `{glyph}` is filled from `glyphAction`/`glyphs`. */
  i18nKey: I18nKey;
  /** Action whose live glyph fills `{glyph}` + the chip row. */
  glyphAction?: InputAction;
  /** Literal glyph override (e.g. keys the input map doesn't bind yet, like map "M"). */
  glyphs?: string[];
  /** Toast visible duration. Default 4200ms. */
  durationMs?: number;
}

const byId = new Map<string, HintDef>();
const byEvent = new Map<OnbEventKey, HintDef[]>();

/** Register (or replace) a contextual hint. Returns an unregister fn. */
export function registerHint(def: HintDef): () => void {
  unregisterHint(def.id);
  byId.set(def.id, def);
  const list = byEvent.get(def.on) ?? [];
  list.push(def);
  byEvent.set(def.on, list);
  return () => unregisterHint(def.id);
}

export function unregisterHint(id: string): void {
  const existing = byId.get(id);
  if (!existing) return;
  byId.delete(id);
  const list = byEvent.get(existing.on);
  if (list) byEvent.set(existing.on, list.filter((d) => d.id !== id));
}

export const hintsForEvent = (event: OnbEventKey): readonly HintDef[] => byEvent.get(event) ?? [];
export const getHint = (id: string): HintDef | undefined => byId.get(id);

let seeded = false;

/** Seed the v1 hint set once. Idempotent. */
export function seedDefaultHints(): void {
  if (seeded) return;
  seeded = true;
  registerHint({
    id: "onb.hint.sprint",
    on: "player:move",
    i18nKey: "onb.hint.sprint",
    glyphAction: InputAction.Sprint,
  });
  registerHint({
    id: "onb.hint.reload",
    on: "combat:fire",
    i18nKey: "onb.hint.reload",
    glyphAction: InputAction.Reload,
  });
  registerHint({
    id: "onb.hint.openMap",
    on: "vehicle:enter",
    i18nKey: "onb.hint.openMap",
    glyphs: ["M"],
  });
  registerHint({
    id: "onb.hint.help",
    on: "onboarding:complete",
    i18nKey: "onb.hint.help",
    glyphs: ["F1"],
  });
}
