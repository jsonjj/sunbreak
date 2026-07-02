// A tiny, dependency-free bloom-pulse signal. Explosions/muzzle flashes push a one-frame
// pulse here; a postprocessing subsystem can `subscribe` and drive its Bloom intensity from
// `value` without any hard coupling to VFX. If nothing subscribes, it's a harmless no-op.

let value = 0;
const subs = new Set<(v: number) => void>();

function emit(): void {
  for (const fn of subs) fn(value);
}

export const bloomPulse = {
  get value(): number {
    return value;
  },
  /** Add to the current pulse (clamped). Call from explosion/muzzle emitters. */
  pulse(amount: number): void {
    const next = value + amount;
    value = next > 2 ? 2 : next;
    emit();
  },
  /** Decay toward 0 each frame (driven by the manager). */
  decay(dt: number): void {
    if (value <= 0) return;
    const next = value - dt * 3;
    value = next < 0 ? 0 : next;
    emit();
  },
  subscribe(fn: (v: number) => void): () => void {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
};
