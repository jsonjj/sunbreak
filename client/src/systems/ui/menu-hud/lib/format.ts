const moneyFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** `$1,204` / `-$50` — used by the money counter + shops. */
export function formatMoney(n: number): string {
  const v = Math.round(n);
  const sign = v < 0 ? "-" : "";
  return `${sign}$${moneyFmt.format(Math.abs(v))}`;
}

export function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

export function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
