// Camera-shake impulse signal (explosions push here). The camera subsystem can `subscribe`
// and add the decaying trauma to its transform. Decoupled + optional: no subscriber = no-op.

let trauma = 0;
const subs = new Set<(v: number) => void>();

function emit(): void {
  for (const fn of subs) fn(trauma);
}

export const shake = {
  get trauma(): number {
    return trauma;
  },
  /** Add trauma 0..1 (clamped). `_seconds` is advisory for consumers. */
  impulse(amount: number, _seconds = 0.4): void {
    const next = trauma + amount;
    trauma = next > 1 ? 1 : next;
    emit();
  },
  decay(dt: number): void {
    if (trauma <= 0) return;
    const next = trauma - dt * 1.8;
    trauma = next < 0 ? 0 : next;
    emit();
  },
  subscribe(fn: (v: number) => void): () => void {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
};
