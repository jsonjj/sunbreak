// HDR-lite ducking: temporarily attenuate categories (e.g. lower music/ambience while dialogue
// or a phone call plays) by ramping their runtime `duck` multiplier. Real sub-bus sidechaining
// is overkill for the browser budget; volume-math ducking through the mixer is enough.
import { useMixer } from "./mixerStore";
import type { Category } from "./categories";
import { clamp01 } from "../AudioEngine";

const ramps = new Map<Category, number>();

const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

function cancel(c: Category): void {
  const handle = ramps.get(c);
  if (handle !== undefined && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(handle);
  ramps.delete(c);
}

function rampTo(c: Category, target: number, ms: number): void {
  cancel(c);
  const store = useMixer.getState();
  const from = store.duck[c] ?? 1;
  const clearAtEnd = target >= 1;
  if (typeof requestAnimationFrame === "undefined" || ms <= 0) {
    if (clearAtEnd) store.clearDuck(c);
    else store.setDuck(c, clamp01(target));
    return;
  }
  const t0 = now();
  const step = (t: number): void => {
    const k = Math.min(1, (t - t0) / ms);
    const v = from + (target - from) * k;
    if (k >= 1) {
      ramps.delete(c);
      if (clearAtEnd) useMixer.getState().clearDuck(c);
      else useMixer.getState().setDuck(c, clamp01(v));
      return;
    }
    useMixer.getState().setDuck(c, clamp01(v));
    ramps.set(c, requestAnimationFrame(step));
  };
  ramps.set(c, requestAnimationFrame(step));
}

/**
 * Duck the given categories by `attenuation` (0..1; 0.6 => reduce to 40%) over `ms`.
 * Returns a `release()` that restores them. Typical: `const undo = duck(['music','ambience'])`.
 */
export function duck(
  categories: readonly Category[],
  attenuation = 0.6,
  ms = 250,
): (restoreMs?: number) => void {
  const target = clamp01(1 - attenuation);
  for (const c of categories) rampTo(c, target, ms);
  let released = false;
  return (restoreMs = 400) => {
    if (released) return;
    released = true;
    restoreDuck(categories, restoreMs);
  };
}

/** Restore ducked categories back to full volume over `ms`. */
export function restoreDuck(categories: readonly Category[], ms = 400): void {
  for (const c of categories) rampTo(c, 1, ms);
}
